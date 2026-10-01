import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Interview } from '../../interviews/entities/interview.entity';
import { PermissionsService } from '../../admin/permissions/permissions.service';
import { Permissions } from '../../admin/permissions/permissions.constants';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { ActorContext } from '../../../common/context/actor-context';

@Injectable()
export class ReviewAccessPolicy {
  constructor(
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Tải interview và xác thực quyền truy cập của actor với chính sách Resource Hiding (404).
   * Tuyệt đối không trả về 403 Forbidden nếu actor không có quyền trên interview này
   * để bảo vệ không rò rỉ sự tồn tại của UUID resource.
   */
  async getAccessibleInterviewOrThrow(
    interviewId: string,
    actor: ActorContext,
  ): Promise<
    Interview & { application: NonNullable<Interview['application']> }
  > {
    const interview = await this.dataSource.getRepository(Interview).findOne({
      where: { id: interviewId },
      relations: {
        application: {
          candidate: true,
          job: true,
        },
        questions: true,
      },
    });

    if (!interview || !interview.application) {
      throw new NotFoundException({
        code: ErrorCodes.INTERVIEW_NOT_FOUND,
        message: 'Phỏng vấn không tồn tại',
      });
    }

    const isAppAdmin = await this.permissionsService.hasAny(actor.userId, [
      Permissions.InterviewsManage,
      Permissions.ApplicationsManage,
      Permissions.DecisionsManage,
    ]);

    const isAppOwner = interview.ownerId === actor.userId;
    const isJobOwner = interview.application.job?.ownerId === actor.userId;

    if (!isAppAdmin && !isAppOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.INTERVIEW_NOT_FOUND,
        message: 'Phỏng vấn không tồn tại',
      });
    }

    return interview as Interview & {
      application: NonNullable<Interview['application']>;
    };
  }
}
