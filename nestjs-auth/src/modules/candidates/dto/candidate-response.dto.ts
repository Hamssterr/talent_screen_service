export class CandidateOwnerDto {
  ownerId: string;
  name: string;
  role?: string[]; // hoặc roles?: string[] nếu 1 user có nhiều role
}

export class CandidateResponseDto {
  id: string;
  owner?: CandidateOwnerDto;
  fullName: string;
  email: string;
  normalizedEmail: string;
  phone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
