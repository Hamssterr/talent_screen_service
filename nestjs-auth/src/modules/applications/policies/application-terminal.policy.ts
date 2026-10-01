import { ConflictException } from '@nestjs/common';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ErrorCodes } from '../../../common/errors/error-codes';

export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
] as const;

export function isApplicationTerminal(status: ApplicationStatus): boolean {
  return TERMINAL_APPLICATION_STATUSES.includes(status);
}

export function assertApplicationNotTerminal(
  status: ApplicationStatus,
  customMessage?: string,
): void {
  if (isApplicationTerminal(status)) {
    throw new ConflictException({
      code: ErrorCodes.APPLICATION_TERMINAL,
      message:
        customMessage ||
        'Hồ sơ ứng tuyển đã ở trạng thái kết thúc, không thể thao tác thêm.',
    });
  }
}
