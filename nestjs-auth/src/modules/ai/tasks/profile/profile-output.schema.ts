import { z } from 'zod';

export const EvidenceSchema = z.object({
  page: z.number().int().min(1).optional(),
  quote: z.string().max(500).optional(),
});

export const ProfileSkillSchema = z.object({
  name: z.string().max(100),
  evidence: EvidenceSchema.optional(),
});

export const ProfileExperienceSchema = z.object({
  role: z.string().max(150),
  organization: z.string().max(150).nullable(),
  startDate: z.string().max(50).nullable(),
  endDate: z.string().max(50).nullable(),
  description: z.string().max(2000).nullable(),
});

export const ProfileProjectSchema = z.object({
  name: z.string().max(150),
  technologies: z.array(z.string().max(100)).max(30),
  contribution: z.string().max(2000).nullable(),
  evidence: EvidenceSchema.optional(),
});

export const ProfileEducationSchema = z.object({
  institution: z.string().max(150).nullable(),
  degree: z.string().max(100).nullable(),
  field: z.string().max(100).nullable(),
  startDate: z.string().max(50).nullable(),
  endDate: z.string().max(50).nullable(),
});

export const ProfileV1OutputSchema = z.object({
  schemaVersion: z.literal('profile.v1'),
  summary: z.string().max(3000).nullable(),
  skills: z.array(ProfileSkillSchema).max(50),
  experiences: z.array(ProfileExperienceSchema).max(30),
  projects: z.array(ProfileProjectSchema).max(30),
  education: z.array(ProfileEducationSchema).max(20),
  missingInformation: z.array(z.string().max(300)).max(50),
});

export type ProfileV1Output = z.infer<typeof ProfileV1OutputSchema>;
