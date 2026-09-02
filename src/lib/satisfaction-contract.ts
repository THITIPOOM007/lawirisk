import { z } from 'zod';

export const satisfactionAudienceSchema = z.enum(['PUBLIC', 'STAFF']);
export const satisfactionContextSchema = z.enum(['PUBLIC_SEARCH', 'PUBLIC_COMPLAINT', 'STAFF_SESSION']);
export const satisfactionRatingSchema = z.number().int().min(1).max(5);

export const satisfactionSubmissionSchema = z.object({
  audience: satisfactionAudienceSchema,
  context: satisfactionContextSchema,
  interactionId: z.string().uuid(),
  convenience: satisfactionRatingSchema,
  speed: satisfactionRatingSchema,
  accuracy: satisfactionRatingSchema,
  overall: satisfactionRatingSchema,
  suggestion: z.string().trim().max(1000).optional().default(''),
}).superRefine((value, context) => {
  const isPublicContext = value.context === 'PUBLIC_SEARCH' || value.context === 'PUBLIC_COMPLAINT';
  if ((value.audience === 'PUBLIC') !== isPublicContext) {
    context.addIssue({
      code: 'custom',
      path: ['context'],
      message: 'บริบทการประเมินไม่ตรงกับประเภทผู้ใช้งาน',
    });
  }
});

export type SatisfactionAudience = z.infer<typeof satisfactionAudienceSchema>;
export type SatisfactionContext = z.infer<typeof satisfactionContextSchema>;
export type SatisfactionSubmission = z.infer<typeof satisfactionSubmissionSchema>;

export type SatisfactionRecord = SatisfactionSubmission & {
  id: string;
  staffUserId: string | null;
  createdAt: string;
};

const summarySegmentSchema = z.object({
  totalResponses: z.number().int().nonnegative(),
  averageRating: z.number().min(0).max(5),
  satisfactionPercent: z.number().min(0).max(100),
});

const dimensionSummarySchema = z.object({
  averageRating: z.number().min(0).max(5),
  satisfactionPercent: z.number().min(0).max(100),
});

const researchSummarySchema = z.object({
  generatedAt: z.string().min(1),
  collectionPeriod: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  targetSampleSize: z.number().int().positive(),
  baselineStatus: z.enum(['FORMING', 'READY']),
  positiveResponsePercent: z.number().min(0).max(100),
  ratingDistribution: z.object({
    '1': z.number().int().nonnegative(),
    '2': z.number().int().nonnegative(),
    '3': z.number().int().nonnegative(),
    '4': z.number().int().nonnegative(),
    '5': z.number().int().nonnegative(),
  }),
  confidence95: z.object({
    lower: z.number().min(1).max(5),
    upper: z.number().min(1).max(5),
  }).nullable(),
  cronbachAlpha: z.number().min(-1).max(1).nullable(),
  weakestDimension: z.enum(['convenience', 'speed', 'accuracy']).nullable(),
});

export const satisfactionSummarySchema = summarySegmentSchema.extend({
  audiences: z.object({
    PUBLIC: summarySegmentSchema,
    STAFF: summarySegmentSchema,
  }),
  dimensions: z.object({
    convenience: dimensionSummarySchema,
    speed: dimensionSummarySchema,
    accuracy: dimensionSummarySchema,
    overall: dimensionSummarySchema,
  }),
  contexts: z.array(z.object({
    context: satisfactionContextSchema,
    totalResponses: z.number().int().nonnegative(),
    averageRating: z.number().min(0).max(5),
    satisfactionPercent: z.number().min(0).max(100),
  })),
  recentSuggestions: z.array(z.object({
    id: z.string(),
    audience: satisfactionAudienceSchema,
    context: satisfactionContextSchema,
    suggestion: z.string(),
    createdAt: z.string(),
  })),
  research: researchSummarySchema.optional(),
});

export type SatisfactionSummary = z.infer<typeof satisfactionSummarySchema>;

const roundedAverage = (values: number[]) => values.length
  ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
  : 0;

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const sampleVariance = (values: number[]) => {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
};

const makeSegment = (records: SatisfactionRecord[]) => {
  const averageRating = roundedAverage(records.map((record) => record.overall));
  return {
    totalResponses: records.length,
    averageRating,
    satisfactionPercent: Math.round((averageRating / 5) * 100),
  };
};

const makeDimension = (records: SatisfactionRecord[], key: 'convenience' | 'speed' | 'accuracy' | 'overall') => {
  const averageRating = roundedAverage(records.map((record) => record[key]));
  return { averageRating, satisfactionPercent: Math.round((averageRating / 5) * 100) };
};

export function summarizeSatisfaction(records: SatisfactionRecord[]): SatisfactionSummary {
  const ordered = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const publicRecords = records.filter((record) => record.audience === 'PUBLIC');
  const staffRecords = records.filter((record) => record.audience === 'STAFF');
  const contexts = satisfactionContextSchema.options
    .map((context) => ({ context, records: records.filter((record) => record.context === context) }))
    .filter((entry) => entry.records.length > 0)
    .map((entry) => ({ context: entry.context, ...makeSegment(entry.records) }));
  const dimensions = {
    convenience: makeDimension(records, 'convenience'),
    speed: makeDimension(records, 'speed'),
    accuracy: makeDimension(records, 'accuracy'),
    overall: makeDimension(records, 'overall'),
  };
  const targetSampleSize = 30;
  const overallRatings = records.map((record) => record.overall);
  const ratingDistribution = {
    '1': overallRatings.filter((rating) => rating === 1).length,
    '2': overallRatings.filter((rating) => rating === 2).length,
    '3': overallRatings.filter((rating) => rating === 3).length,
    '4': overallRatings.filter((rating) => rating === 4).length,
    '5': overallRatings.filter((rating) => rating === 5).length,
  };
  const confidence95 = records.length >= targetSampleSize
    ? (() => {
      const mean = overallRatings.reduce((sum, rating) => sum + rating, 0) / overallRatings.length;
      const margin = 1.96 * Math.sqrt(sampleVariance(overallRatings) / overallRatings.length);
      return {
        lower: roundTo(Math.max(1, mean - margin), 2),
        upper: roundTo(Math.min(5, mean + margin), 2),
      };
    })()
    : null;
  const ratingKeys = ['convenience', 'speed', 'accuracy', 'overall'] as const;
  const totalScores = records.map((record) => ratingKeys.reduce((sum, key) => sum + record[key], 0));
  const totalVariance = sampleVariance(totalScores);
  const rawAlpha = records.length >= targetSampleSize && totalVariance > 0
    ? (ratingKeys.length / (ratingKeys.length - 1))
      * (1 - (ratingKeys.reduce((sum, key) => sum + sampleVariance(records.map((record) => record[key])), 0) / totalVariance))
    : null;
  const cronbachAlpha = rawAlpha === null ? null : roundTo(Math.max(-1, Math.min(1, rawAlpha)), 2);
  const weakestDimension = records.length
    ? (['convenience', 'speed', 'accuracy'] as const)
      .reduce((weakest, key) => dimensions[key].averageRating < dimensions[weakest].averageRating ? key : weakest)
    : null;

  return satisfactionSummarySchema.parse({
    ...makeSegment(records),
    audiences: {
      PUBLIC: makeSegment(publicRecords),
      STAFF: makeSegment(staffRecords),
    },
    dimensions,
    contexts,
    recentSuggestions: ordered
      .filter((record) => record.suggestion.trim())
      .slice(0, 8)
      .map((record) => ({
        id: record.id,
        audience: record.audience,
        context: record.context,
        suggestion: record.suggestion,
        createdAt: record.createdAt,
      })),
    research: {
      generatedAt: new Date().toISOString(),
      collectionPeriod: {
        from: ordered.at(-1)?.createdAt || null,
        to: ordered[0]?.createdAt || null,
      },
      targetSampleSize,
      baselineStatus: records.length >= targetSampleSize ? 'READY' : 'FORMING',
      positiveResponsePercent: records.length
        ? Math.round((overallRatings.filter((rating) => rating >= 4).length / records.length) * 100)
        : 0,
      ratingDistribution,
      confidence95,
      cronbachAlpha,
      weakestDimension,
    },
  });
}
