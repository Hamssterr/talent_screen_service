import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Readable } from 'stream';
import { CvExtractionStateService } from './cv-extraction-state.service';
import { PdfTextExtractorService } from '../extraction/pdf-text-extractor.service';
import {
  DOCUMENT_STORAGE_TOKEN,
  type DocumentStorage,
} from '../../../platform/storage/document-storage.interface';
import { AiService } from '../../ai/ai.service';
import { validateProfileEvidence } from '../../ai/tasks/profile/profile-evidence.validator';
import { IdempotencyService } from '../../../platform/idempotency/idempotency.service';
import { ActorContext } from '../../../common/context/actor-context';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { CvVersion } from '../entities/cv-version.entity';
import { CvExtractionStatus } from '../enums/cv-extraction-status.enum';
import { ExtractCvProfileDto } from '../dto/extract-cv-profile.dto';
import { RetryCvExtractionDto } from '../dto/retry-cv-extraction.dto';
import { CvExtractionResponseDto } from '../dto/cv-extraction-response.dto';
import {
  PdfExtractionError,
  PdfExtractionErrorCode,
} from '../extraction/pdf-extraction.error';
import { ProviderError } from '../../../platform/external-providers/errors/provider-error';
import { ProviderErrorCode } from '../../../platform/external-providers/errors/provider-error-code';

@Injectable()
export class CvProfileAiService {
  private readonly logger = new Logger(CvProfileAiService.name);

  constructor(
    private readonly stateService: CvExtractionStateService,
    private readonly pdfTextExtractor: PdfTextExtractorService,
    @Inject(DOCUMENT_STORAGE_TOKEN)
    private readonly documentStorage: DocumentStorage,
    private readonly aiService: AiService,
    private readonly idempotencyService: IdempotencyService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Endpoint 1: Initial extraction (pending -> processing -> ready | failed | needs_manual_input)
   */
  async extractProfile(
    actor: ActorContext,
    cvId: string,
    dto: ExtractCvProfileDto,
    idempotencyKey?: string,
  ): Promise<CvExtractionResponseDto> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException('Header Idempotency-Key là bắt buộc');
    }

    const canonicalPayload = {
      action: 'extract-profile',
      cvVersionId: cvId,
      expectedProcessingVersion: dto.expectedProcessingVersion,
    };

    const result =
      await this.idempotencyService.execute<CvExtractionResponseDto>({
        actorScope: actor.userId,
        route: `/api/v1/cv-versions/${cvId}/extract-profile`,
        key: idempotencyKey,
        method: 'POST',
        body: canonicalPayload,
        action: async () => {
          const body = await this.executeExtractionWorkflow(
            actor,
            cvId,
            dto.expectedProcessingVersion,
            false,
          );
          return { status: 200, body };
        },
      });

    return result.body;
  }

  /**
   * Endpoint 2: Retry extraction (failed / needs_manual_input / stale processing -> processing)
   */
  async retryExtraction(
    actor: ActorContext,
    cvId: string,
    dto: RetryCvExtractionDto,
    idempotencyKey?: string,
  ): Promise<CvExtractionResponseDto> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException('Header Idempotency-Key là bắt buộc');
    }

    const canonicalPayload = {
      action: 'retry-extraction',
      cvVersionId: cvId,
      expectedProcessingVersion: dto.expectedProcessingVersion,
    };

    const result =
      await this.idempotencyService.execute<CvExtractionResponseDto>({
        actorScope: actor.userId,
        route: `/api/v1/cv-versions/${cvId}/retry-extraction`,
        key: idempotencyKey,
        method: 'POST',
        body: canonicalPayload,
        action: async () => {
          const body = await this.executeExtractionWorkflow(
            actor,
            cvId,
            dto.expectedProcessingVersion,
            true,
          );
          return { status: 200, body };
        },
      });

    return result.body;
  }

  /**
   * Orchestration workflow tuân thủ Two-Transaction Pattern:
   * 1. Transaction 1: Claim và lock, chuyển status sang processing, tạo AiRun -> commit.
   * 2. Ngoài Transaction: Đọc PDF từ storage -> Parse PDF -> Gọi Gemini AI -> Validate evidence.
   * 3. Transaction 2: Lock và kiểm tra processingVersion -> Lưu kết quả profile draft -> commit.
   * 4. Failure Transaction: Nếu gặp bất kỳ lỗi nào, ghi nhận failure an toàn và ném exception phù hợp.
   */
  private async executeExtractionWorkflow(
    actor: ActorContext,
    cvId: string,
    expectedProcessingVersion: number,
    isRetry: boolean,
  ): Promise<CvExtractionResponseDto> {
    // -------------------------------------------------------------
    // BƯỚC 1: TRANSACTION 1 (CLAIM EXTRACTION)
    // -------------------------------------------------------------
    const claim = await this.dataSource.transaction(async (manager) => {
      if (isRetry) {
        return this.stateService.claimRetryExtraction(
          manager,
          cvId,
          expectedProcessingVersion,
          actor,
        );
      } else {
        return this.stateService.claimInitialExtraction(
          manager,
          cvId,
          expectedProcessingVersion,
          actor,
        );
      }
    });

    const claimedProcessingVersion = claim.processingVersion;
    const aiRunId = claim.aiRun.id;
    const storageKey = claim.cv.storageKey;
    const startTime = Date.now();

    // -------------------------------------------------------------
    // BƯỚC 2: NGOÀI TRANSACTION (STORAGE, PDF PARSING, GEMINI CALL)
    // -------------------------------------------------------------
    try {
      // 2.1 Đọc PDF stream từ storage
      let stream: Readable;
      try {
        stream = await this.documentStorage.get(storageKey);
      } catch (storageErr) {
        this.logger.error(
          `Storage read error for CV ${cvId}: ${String(storageErr)}`,
        );
        throw new PdfExtractionError(
          PdfExtractionErrorCode.UNKNOWN,
          'Không thể đọc file từ hệ thống lưu trữ',
          { cause: String(storageErr) },
        );
      }

      // 2.2 Trích xuất text từ PDF
      const maxPages = this.configService.get<number>(
        'cvExtraction.maxPages',
        20,
      );
      const maxTextChars = this.configService.get<number>(
        'cvExtraction.maxTextChars',
        50000,
      );

      const extractionResult = await this.pdfTextExtractor.extract(stream, {
        maxPages,
        maxTextChars,
      });

      // 2.3 Gọi Gemini AI để trích xuất Profile theo schema
      const aiResult = await this.aiService.extractProfile({
        cvVersionId: cvId,
        pages: extractionResult.pages,
      });

      // 2.4 Kiểm tra tính xác thực của Evidence (Chống Hallucination)
      const evidenceValidation = validateProfileEvidence(
        aiResult.data,
        extractionResult.pages,
      );

      if (!evidenceValidation.isValid) {
        this.logger.warn(
          `Evidence validation failed for CV ${cvId}: ${evidenceValidation.reason}`,
        );
        throw new ProviderError({
          provider: 'gemini',
          code: ProviderErrorCode.INVALID_REQUEST,
          message:
            evidenceValidation.reason ||
            'AI trích dẫn bằng chứng không tồn tại trong tài liệu CV',
        });
      }

      // -------------------------------------------------------------
      // BƯỚC 3: TRANSACTION 2 (COMPLETE EXTRACTION - APPLY SUCCESS)
      // -------------------------------------------------------------
      const completeResult = await this.dataSource.transaction(
        async (manager) => {
          return this.stateService.completeExtraction(
            manager,
            cvId,
            claimedProcessingVersion,
            aiRunId,
            {
              pageCount: extractionResult.pageCount,
              extractedText: extractionResult.combinedText,
              profile: aiResult.data,
              latencyMs: aiResult.latencyMs,
              inputTokens: aiResult.inputTokens,
              outputTokens: aiResult.outputTokens,
            },
            actor,
          );
        },
      );

      if (completeResult.superseded || !completeResult.cv) {
        throw new ConflictException({
          code: ErrorCodes.AI_RESULT_SUPERSEDED,
          message:
            'Kết quả trích xuất đã bị thay thế bởi phiên bản xử lý mới hơn',
          details: { canRetry: false },
        });
      }

      return this.toResponseDto(completeResult.cv, false);
    } catch (error) {
      // -------------------------------------------------------------
      // BƯỚC 4: FAILURE TRANSACTION (XỬ LÝ VÀ MAP LỖI AN TOÀN)
      // -------------------------------------------------------------
      const durationMs = Date.now() - startTime;
      const { status, errorCode, safeMessage, canRetry, httpStatus } =
        this.mapErrorToFailure(error);

      try {
        await this.dataSource.transaction(async (manager) => {
          await this.stateService.failExtraction(
            manager,
            cvId,
            claimedProcessingVersion,
            aiRunId,
            {
              status,
              errorCode,
              errorMessage: safeMessage,
              durationMs,
            },
            actor,
          );
        });
      } catch (dbFailErr) {
        this.logger.error(
          `Failed to record failure transaction for CV ${cvId}: ${String(dbFailErr)}`,
        );
      }

      // Ném exception có cấu trúc để GlobalExceptionFilter trả về format chuẩn
      if (httpStatus === 422) {
        throw new UnprocessableEntityException({
          code: errorCode,
          message: safeMessage,
          details: {
            extractionStatus: status,
            processingVersion: claimedProcessingVersion,
            canRetry,
          },
        });
      } else if (httpStatus === 400) {
        throw new BadRequestException({
          code: errorCode,
          message: safeMessage,
          details: {
            extractionStatus: status,
            processingVersion: claimedProcessingVersion,
            canRetry,
          },
        });
      } else if (httpStatus === 409) {
        throw new ConflictException({
          code: errorCode,
          message: safeMessage,
          details: {
            extractionStatus: status,
            processingVersion: claimedProcessingVersion,
            canRetry,
          },
        });
      } else {
        throw new BadGatewayException({
          code: errorCode,
          message: safeMessage,
          details: {
            extractionStatus: status,
            processingVersion: claimedProcessingVersion,
            canRetry,
          },
        });
      }
    }
  }

  /**
   * Phân loại và ánh xạ lỗi sang trạng thái nghiệp vụ và mã lỗi chuẩn
   */
  private mapErrorToFailure(error: unknown): {
    status: CvExtractionStatus;
    errorCode: string;
    safeMessage: string;
    canRetry: boolean;
    httpStatus: number;
  } {
    // 1. Lỗi phân tích PDF
    if (error instanceof PdfExtractionError) {
      switch (error.code) {
        case PdfExtractionErrorCode.ENCRYPTED:
          return {
            status: CvExtractionStatus.NEEDS_MANUAL_INPUT,
            errorCode: ErrorCodes.CV_ENCRYPTED_PDF,
            safeMessage:
              'File PDF được đặt mật khẩu hoặc bị mã hóa. Vui lòng nhập thông tin thủ công hoặc upload file không đặt mật khẩu.',
            canRetry: false,
            httpStatus: 422,
          };
        case PdfExtractionErrorCode.NO_MEANINGFUL_TEXT:
          return {
            status: CvExtractionStatus.NEEDS_MANUAL_INPUT,
            errorCode: ErrorCodes.CV_TEXT_UNAVAILABLE,
            safeMessage:
              'File PDF không chứa văn bản có thể trích xuất (có thể là bản scan hoặc ảnh). Vui lòng nhập thông tin profile thủ công.',
            canRetry: false,
            httpStatus: 422,
          };
        case PdfExtractionErrorCode.PAGE_LIMIT_EXCEEDED:
          return {
            status: CvExtractionStatus.NEEDS_MANUAL_INPUT,
            errorCode: ErrorCodes.CV_PAGE_LIMIT_EXCEEDED,
            safeMessage:
              'File PDF vượt quá giới hạn 20 trang. Vui lòng rút gọn file hoặc nhập thông tin profile thủ công.',
            canRetry: false,
            httpStatus: 422,
          };
        case PdfExtractionErrorCode.STREAM_LIMIT_EXCEEDED:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.CV_FILE_TOO_LARGE,
            safeMessage: 'Dung lượng file PDF vượt quá giới hạn hệ thống.',
            canRetry: false,
            httpStatus: 400,
          };
        case PdfExtractionErrorCode.CORRUPTED:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.CV_FILE_INVALID,
            safeMessage: 'File PDF không hợp lệ hoặc đã bị lỗi cấu trúc.',
            canRetry: false,
            httpStatus: 400,
          };
        case PdfExtractionErrorCode.TIMEOUT:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.CV_EXTRACTION_FAILED,
            safeMessage:
              'Quá trình đọc file PDF bị quá thời gian cho phép. Bạn có thể thử lại.',
            canRetry: true,
            httpStatus: 502,
          };
        default:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.CV_EXTRACTION_FAILED,
            safeMessage: 'Không thể trích xuất nội dung văn bản từ file PDF.',
            canRetry: true,
            httpStatus: 502,
          };
      }
    }

    // 2. Lỗi từ AI Provider (Gemini)
    if (error instanceof ProviderError) {
      switch (error.code) {
        case ProviderErrorCode.TIMEOUT:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.AI_TIMEOUT,
            safeMessage:
              'Dịch vụ AI phản hồi quá thời gian quy định. Vui lòng thử lại sau.',
            canRetry: true,
            httpStatus: 504,
          };
        case ProviderErrorCode.RATE_LIMITED:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.AI_RATE_LIMITED,
            safeMessage:
              'Dịch vụ AI đang bị quá tải hoặc vượt hạn mức (Rate Limited). Vui lòng thử lại sau ít phút.',
            canRetry: true,
            httpStatus: 429,
          };
        case ProviderErrorCode.UNAUTHORIZED:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.AI_UNAUTHORIZED,
            safeMessage:
              'Cấu hình xác thực AI không hợp lệ hoặc API Key đã hết hạn.',
            canRetry: false,
            httpStatus: 502,
          };
        case ProviderErrorCode.TEMPORARY:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.AI_PROVIDER_UNAVAILABLE,
            safeMessage:
              'Dịch vụ AI tạm thời không phản hồi. Vui lòng thử lại sau.',
            canRetry: true,
            httpStatus: 502,
          };
        case ProviderErrorCode.INVALID_REQUEST:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.AI_INVALID_OUTPUT,
            safeMessage:
              'Kết quả trích xuất từ AI không hợp lệ hoặc không khớp cấu trúc bằng chứng.',
            canRetry: true,
            httpStatus: 502,
          };
        default:
          return {
            status: CvExtractionStatus.FAILED,
            errorCode: ErrorCodes.AI_PROVIDER_UNAVAILABLE,
            safeMessage: 'Đã xảy ra lỗi khi xử lý với nhà cung cấp AI.',
            canRetry: true,
            httpStatus: 502,
          };
      }
    }

    // 3. Fallback cho các lỗi khác
    return {
      status: CvExtractionStatus.FAILED,
      errorCode: ErrorCodes.CV_EXTRACTION_FAILED,
      safeMessage: 'Đã có lỗi xảy ra trong quá trình trích xuất hồ sơ CV.',
      canRetry: true,
      httpStatus: 500,
    };
  }

  /**
   * Helper chuyển đổi CvVersion sang CvExtractionResponseDto an toàn (không leak storage/text/pii)
   */
  private toResponseDto(
    cv: CvVersion,
    canRetry: boolean,
  ): CvExtractionResponseDto {
    return {
      id: cv.id,
      applicationId: cv.applicationId,
      version: cv.version,
      originalFilename: cv.originalFilename,
      pageCount: cv.pageCount,
      extractionStatus: cv.extractionStatus,
      processingVersion: cv.processingVersion,
      profileStatus: cv.profileStatus,
      profileVersion: cv.profileVersion,
      profileJson: cv.profileJson,
      errorCode: cv.errorCode,
      canRetry,
      createdAt: cv.createdAt,
      updatedAt: cv.updatedAt,
    };
  }
}
