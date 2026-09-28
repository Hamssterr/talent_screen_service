import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AiRun } from '../entities/ai-run.entity';
import { AiRunStatus } from '../enums/ai-run-status.enum';
import { AiTask } from '../enums/ai-task.enum';

export interface StartAiRunInput {
  task: AiTask;
  provider?: string;
  model: string;
  aggregateType: string;
  aggregateId: string;
  promptVersion: string;
  schemaVersion: string;
  inputHash: string;
  startedAt?: Date;
}

export interface SucceedAiRunInput {
  completedAt?: Date;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

@Injectable()
export class AiRunService {
  private readonly logger = new Logger(AiRunService.name);

  /**
   * Khởi tạo bản ghi AiRun mới ở trạng thái PROCESSING.
   * Dùng EntityManager được truyền từ Feature Application Service.
   */
  async start(manager: EntityManager, input: StartAiRunInput): Promise<AiRun> {
    const repo = manager.getRepository(AiRun);

    const run = repo.create({
      task: input.task,
      provider: input.provider || 'gemini',
      model: input.model,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      inputHash: input.inputHash,
      status: AiRunStatus.PROCESSING,
      startedAt: input.startedAt || new Date(),
    });

    const saved = await repo.save(run);
    this.logger.log(
      `[AiRun] Started run ${saved.id} for task=${saved.task}, aggregate=${saved.aggregateType}:${saved.aggregateId}`,
    );
    return saved;
  }

  /**
   * Cập nhật kết quả thành công cho AiRun.
   * Chỉ transition từ PROCESSING -> SUCCEEDED.
   * Chống late overwrite: nếu run không còn ở PROCESSING (ví dụ đã superseded hoặc failed), bỏ qua.
   */
  async succeed(
    manager: EntityManager,
    runId: string,
    result: SucceedAiRunInput,
  ): Promise<AiRun | null> {
    const repo = manager.getRepository(AiRun);

    const run = await repo
      .createQueryBuilder('run')
      .setLock('pessimistic_write')
      .where('run.id = :id', { id: runId })
      .getOne();

    if (!run) {
      this.logger.warn(`[AiRun] Run ${runId} not found to mark succeed`);
      return null;
    }

    if (run.status !== AiRunStatus.PROCESSING) {
      this.logger.warn(
        `[AiRun] Ignoring succeed for run ${runId} because current status is ${run.status} (expected PROCESSING)`,
      );
      return run;
    }

    run.status = AiRunStatus.SUCCEEDED;
    run.completedAt = result.completedAt || new Date();
    run.latencyMs = result.latencyMs;
    run.inputTokens = result.inputTokens ?? null;
    run.outputTokens = result.outputTokens ?? null;
    run.errorCode = null;

    const saved = await repo.save(run);
    this.logger.log(
      `[AiRun] Succeeded run ${saved.id}, latency=${saved.latencyMs}ms`,
    );
    return saved;
  }

  /**
   * Cập nhật kết quả thất bại cho AiRun.
   * Chỉ transition từ PROCESSING -> FAILED.
   * Chống late overwrite nếu run đã ở terminal state hoặc superseded.
   */
  async fail(
    manager: EntityManager,
    runId: string,
    errorCode: string,
  ): Promise<AiRun | null> {
    const repo = manager.getRepository(AiRun);

    const run = await repo
      .createQueryBuilder('run')
      .setLock('pessimistic_write')
      .where('run.id = :id', { id: runId })
      .getOne();

    if (!run) {
      this.logger.warn(`[AiRun] Run ${runId} not found to mark fail`);
      return null;
    }

    if (run.status !== AiRunStatus.PROCESSING) {
      this.logger.warn(
        `[AiRun] Ignoring fail for run ${runId} because current status is ${run.status} (expected PROCESSING)`,
      );
      return run;
    }

    run.status = AiRunStatus.FAILED;
    run.completedAt = new Date();
    run.errorCode = errorCode.substring(0, 100);

    const saved = await repo.save(run);
    this.logger.log(
      `[AiRun] Failed run ${saved.id} with errorCode=${saved.errorCode}`,
    );
    return saved;
  }

  /**
   * Đánh dấu run bị thay thế (SUPERSEDED).
   * Dùng khi người dùng bấm retry hoặc một run mới hơn được bắt đầu cho cùng aggregate.
   */
  async supersede(
    manager: EntityManager,
    runId: string,
  ): Promise<AiRun | null> {
    const repo = manager.getRepository(AiRun);

    const run = await repo
      .createQueryBuilder('run')
      .setLock('pessimistic_write')
      .where('run.id = :id', { id: runId })
      .getOne();

    if (!run) {
      return null;
    }

    if (run.status === AiRunStatus.PROCESSING) {
      run.status = AiRunStatus.SUPERSEDED;
      run.completedAt = new Date();
      const saved = await repo.save(run);
      this.logger.log(`[AiRun] Superseded run ${saved.id}`);
      return saved;
    }

    return run;
  }
}
