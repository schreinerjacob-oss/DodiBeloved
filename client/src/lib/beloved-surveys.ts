import type { BelovedSurveyId } from '@/types';

export interface SurveyOption {
  value: string;
  label: string;
}

export interface SurveyQuestion {
  key: string;
  label: string;
  type: 'single' | 'multi' | 'text';
  options?: SurveyOption[];
}

export interface SurveyDef {
  id: BelovedSurveyId;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  maxSelections?: number; // for multi
}

export const BELOVED_SURVEYS: SurveyDef[] = [
  {
    id: 'loveLanguage',
    title: 'Love Language',
    description: 'How you feel most loved (pick 1–2)',
    maxSelections: 2,
    questions: [
      {
        key: 'primary',
        label: 'My love language(s)',
        type: 'multi',
        options: [
          { value: 'words', label: 'Words of Affirmation' },
          { value: 'acts', label: 'Acts of Service' },
          { value: 'gifts', label: 'Receiving Gifts' },
          { value: 'time', label: 'Quality Time' },
          { value: 'touch', label: 'Physical Touch' },
        ],
      },
    ],
  },
  {
    id: 'attachmentStyle',
    title: 'Attachment Style',
    description: 'How you tend to connect (pick 1)',
    questions: [
      {
        key: 'style',
        label: 'My attachment style',
        type: 'single',
        options: [
          { value: 'secure', label: 'Secure' },
          { value: 'anxious', label: 'Anxious' },
          { value: 'avoidant', label: 'Avoidant' },
          { value: 'anxious-avoidant', label: 'Anxious-Avoidant' },
        ],
      },
    ],
  },
  {
    id: 'apologyLanguage',
    title: 'Apology Language',
    description: 'What helps you feel truly apologized to (pick 1–2)',
    maxSelections: 2,
    questions: [
      {
        key: 'primary',
        label: 'My apology language(s)',
        type: 'multi',
        options: [
          { value: 'regret', label: 'Expressing Regret' },
          { value: 'responsibility', label: 'Accepting Responsibility' },
          { value: 'restitution', label: 'Making Restitution' },
          { value: 'repentance', label: 'Genuine Repentance' },
          { value: 'forgiveness', label: 'Requesting Forgiveness' },
        ],
      },
    ],
  },
  {
    id: 'communicationStyle',
    title: 'Communication Style',
    description: 'How you prefer to communicate (pick 1–2)',
    maxSelections: 2,
    questions: [
      {
        key: 'primary',
        label: 'My style(s)',
        type: 'multi',
        options: [
          { value: 'direct', label: 'Direct' },
          { value: 'reflective', label: 'Reflective' },
          { value: 'supportive', label: 'Supportive' },
          { value: 'analytical', label: 'Analytical' },
          { value: 'expressive', label: 'Expressive' },
        ],
      },
    ],
  },
  {
    id: 'coreValues',
    title: 'Core Values',
    description: 'What matters most to you (pick up to 3)',
    maxSelections: 3,
    questions: [
      {
        key: 'values',
        label: 'My core values',
        type: 'multi',
        options: [
          { value: 'family', label: 'Family' },
          { value: 'faith', label: 'Faith' },
          { value: 'honesty', label: 'Honesty' },
          { value: 'growth', label: 'Growth' },
          { value: 'adventure', label: 'Adventure' },
          { value: 'peace', label: 'Peace' },
          { value: 'creativity', label: 'Creativity' },
          { value: 'service', label: 'Service' },
          { value: 'independence', label: 'Independence' },
          { value: 'partnership', label: 'Partnership' },
        ],
      },
    ],
  },
  {
    id: 'familyNorms',
    title: 'Family Norms & History',
    description: 'Short answers about your family',
    questions: [
      { key: 'q1', label: 'What was dinner like growing up?', type: 'text' },
      { key: 'q2', label: 'How did your family handle conflict?', type: 'text' },
      { key: 'q3', label: 'What traditions do you want to keep or change?', type: 'text' },
    ],
  },
  {
    id: 'likesDislikes',
    title: 'Likes & Dislikes',
    description: 'Quick lists',
    questions: [
      { key: 'likes', label: 'Things I love', type: 'text' },
      { key: 'dislikes', label: 'Things I’d rather avoid', type: 'text' },
    ],
  },
  {
    id: 'dreamsFuture',
    title: 'Dreams & Future Hopes',
    description: 'What you hope for',
    questions: [
      { key: 'q1', label: 'A dream I have for myself', type: 'text' },
      { key: 'q2', label: 'A dream I have for us', type: 'text' },
    ],
  },
];
