import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Application } from '../../applications/entities/application.entity';
import { StorageProvider } from '../enums/storage-provider.enum';
import { CvExtractionStatus } from '../enums/cv-extraction-status.enum';
import { CvProfileStatus } from '../enums/cv-profile-status.enum';
import { CvProfileV1Dto } from '../schemas/cv-profile-v1.schema';

@Entity('cv_versions')
@Index(['applicationId', 'createdAt', 'id'])
@Index(['ownerId', 'createdAt', 'id'])
@Index(['extractionStatus', 'createdAt'])
export class CvVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner?: User;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'application_id' })
  application?: Application;

  @Column({ type: 'integer' })
  version: number;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({
    name: 'storage_provider',
    type: 'enum',
    enum: StorageProvider,
  })
  storageProvider: StorageProvider;

  @Column({ name: 'storage_key', type: 'varchar', length: 500, unique: true })
  storageKey: string;

  @Column({ name: 'storage_metadata', type: 'jsonb', nullable: true })
  storageMetadata: Record<string, unknown> | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'page_count', type: 'integer', nullable: true })
  pageCount: number | null;

  @Column({
    name: 'extraction_status',
    type: 'enum',
    enum: CvExtractionStatus,
    default: CvExtractionStatus.PENDING,
  })
  extractionStatus: CvExtractionStatus;

  @Column({ name: 'processing_version', type: 'integer', default: 1 })
  processingVersion: number;

  @Column({ name: 'extracted_text', type: 'text', nullable: true })
  extractedText: string | null;

  @Column({ name: 'profile_json', type: 'jsonb', nullable: true })
  profileJson: CvProfileV1Dto | null;

  @Column({
    name: 'profile_status',
    type: 'enum',
    enum: CvProfileStatus,
    default: CvProfileStatus.DRAFT,
  })
  profileStatus: CvProfileStatus;

  @Column({ name: 'profile_version', type: 'integer', default: 1 })
  profileVersion: number;

  @Column({ name: 'profile_approved_by', type: 'uuid', nullable: true })
  profileApprovedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'profile_approved_by' })
  approver?: User | null;

  @Column({ name: 'profile_approved_at', type: 'timestamptz', nullable: true })
  profileApprovedAt: Date | null;

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
