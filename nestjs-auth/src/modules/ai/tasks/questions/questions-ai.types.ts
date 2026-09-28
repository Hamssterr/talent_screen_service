import { QuestionLanguage } from '../../../question-sets/enums/question-language.enum';

export interface QuestionJobCriterion {
  id: string;
  name: string;
  description: string;
}

export interface QuestionJobSnapshot {
  jobId: string;
  title: string;
  description: string;
  requiredSkills: string[];
  evaluationCriteria: QuestionJobCriterion[];
  version: number;
}

export interface QuestionProfileSnapshot {
  schemaVersion: string;
  personalInfo?: {
    fullName?: string;
  };
  skills?: Array<{
    name: string;
    category?: string;
    yearsOfExperience?: number;
  }>;
  workExperiences?: Array<{
    company: string;
    role: string;
    startDate?: string;
    endDate?: string | null;
    isCurrent?: boolean;
    description?: string;
    technologies?: string[];
  }>;
  educations?: Array<{
    institution: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: number;
  }>;
  projects?: Array<{
    name: string;
    role?: string;
    description?: string;
    technologies?: string[];
  }>;
  certifications?: Array<{
    name: string;
    issuer?: string;
    year?: number;
  }>;
}

export interface QuestionGenerationTaskInput {
  profileSnapshot: QuestionProfileSnapshot;
  jobSnapshot: QuestionJobSnapshot;
  language: QuestionLanguage;
  questionCount: number;
}

import type {
  GeneratedQuestionItemSchema,
  QuestionsOutputSchema,
} from './questions-output.schema';
import { z } from 'zod';

export type GeneratedQuestionItem = z.infer<typeof GeneratedQuestionItemSchema>;
export type QuestionGenerationOutput = z.infer<typeof QuestionsOutputSchema>;

export interface QuestionEvidenceValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}
