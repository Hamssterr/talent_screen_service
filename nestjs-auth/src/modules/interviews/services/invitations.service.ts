import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation } from '../entities/invitation.entity';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
  ) {}

  async findByInterview(interviewId: string): Promise<Invitation[]> {
    return this.invitationRepository.find({
      where: { interviewId },
      order: { invitationVersion: 'DESC' },
    });
  }
}
