import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Interview } from '../entities/interview.entity';
import { InterviewStatus } from '../enums/interview-status.enum';
import { Application } from '../../applications/entities/application.entity';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { Invitation } from '../entities/invitation.entity';
import { InterviewAccessCredential } from '../entities/interview-access-credential.entity';
import { AuditService } from '../../../platform/audit/audit.service';

@Injectable()
export class InterviewLifecycleService {
  private readonly logger = new Logger(InterviewLifecycleService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Đánh dấu hết hạn phỏng vấn (Expired Transition)
   * Nếu Interview chưa bắt đầu (status=invited) và đã quá invitationExpiresAt:
   * Chuyển Interview -> expired, Application -> shortlisted (tăng version),
   * revoke active invitations/credentials.
   */
  async expireInterview(
    interviewId: string,
    existingManager?: EntityManager,
  ): Promise<boolean> {
    const execute = async (manager: EntityManager) => {
      const interviewRepo = manager.getRepository(Interview);
      const appRepo = manager.getRepository(Application);
      const invRepo = manager.getRepository(Invitation);
      const credRepo = manager.getRepository(InterviewAccessCredential);

      // Lock Application trước, sau đó Interview để đảm bảo thứ tự lock
      const interview = await interviewRepo.findOne({
        where: { id: interviewId },
      });

      if (!interview || interview.status !== InterviewStatus.INVITED) {
        return false;
      }

      const now = new Date();
      if (interview.invitationExpiresAt > now) {
        return false; // Chưa hết hạn
      }

      const application = await appRepo
        .createQueryBuilder('app')
        .setLock('pessimistic_write')
        .where('app.id = :id', { id: interview.applicationId })
        .getOne();

      if (!application) {
        return false;
      }

      const lockedInterview = await interviewRepo
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id: interviewId })
        .getOne();

      if (
        !lockedInterview ||
        lockedInterview.status !== InterviewStatus.INVITED
      ) {
        return false;
      }

      // 1. Cập nhật Interview status -> EXPIRED
      lockedInterview.status = InterviewStatus.EXPIRED;
      lockedInterview.version += 1;
      await interviewRepo.save(lockedInterview);

      // 2. Thu hồi các invitation và credentials
      const invitations = await invRepo.find({
        where: { interviewId: lockedInterview.id },
      });

      for (const inv of invitations) {
        if (!inv.revokedAt) {
          inv.revokedAt = now;
          await invRepo.save(inv);

          await credRepo.update(
            { invitationId: inv.id, revokedAt: IsNull() },
            { revokedAt: now },
          );
        }
      }

      // 3. Đưa Application về trạng thái shortlisted nếu đang interviewing
      if (application.status === ApplicationStatus.INTERVIEWING) {
        application.status = ApplicationStatus.SHORTLISTED;
        application.version += 1;
        await appRepo.save(application);
      }

      // 4. Audit
      await this.auditService.record(
        {
          actorId: null,
          actorType: 'system',
          action: 'interview.expired',
          targetType: 'interview',
          targetId: lockedInterview.id,
          ownerId: lockedInterview.ownerId,
          metadata: {
            applicationId: application.id,
            previousStatus: InterviewStatus.INVITED,
            newStatus: InterviewStatus.EXPIRED,
          },
        },
        manager,
      );

      this.logger.log(`Interview ${interviewId} marked as EXPIRED`);
      return true;
    };

    if (existingManager) {
      return execute(existingManager);
    }
    return this.dataSource.transaction(execute);
  }
}
