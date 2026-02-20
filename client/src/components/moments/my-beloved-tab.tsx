import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock, User } from 'lucide-react';
import { BELOVED_SURVEYS, type SurveyDef } from '@/lib/beloved-surveys';
import { getBelovedSurveyAnswer, saveBelovedSurveyAnswer } from '@/lib/storage-encrypted';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import type { BelovedSurveyAnswer, BelovedSurveyId } from '@/types';
import { useToast } from '@/hooks/use-toast';

export function MyBelovedTab() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendP2P } = usePeerConnection();
  const [surveyId, setSurveyId] = useState<BelovedSurveyId>('loveLanguage');
  const [myAnswers, setMyAnswers] = useState<BelovedSurveyAnswer | null>(null);
  const [partnerAnswers, setPartnerAnswers] = useState<BelovedSurveyAnswer | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);

  const survey = BELOVED_SURVEYS.find(s => s.id === surveyId)!;

  useEffect(() => {
    if (!userId || !partnerId) return;
    (async () => {
      const [mine, partner] = await Promise.all([
        getBelovedSurveyAnswer(surveyId, userId),
        getBelovedSurveyAnswer(surveyId, partnerId),
      ]);
      setMyAnswers(mine);
      setPartnerAnswers(partner);
      setFormValues(mine?.answers ?? {});
    })();
  }, [userId, partnerId, surveyId]);

  const handleSave = async () => {
    if (!userId || !partnerId) return;
    setSaving(true);
    try {
      const answer: BelovedSurveyAnswer = {
        id: `${surveyId}-${userId}`,
        surveyId,
        userId,
        partnerId,
        answers: formValues,
        updatedAt: new Date(),
      };
      await saveBelovedSurveyAnswer(answer);
      setMyAnswers(answer);
      sendP2P({ type: 'beloved_survey', data: answer, timestamp: Date.now() });
      toast({ title: 'Saved', description: 'Your answers are stored only on your devices.' });
    } catch (e) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key: string, value: string | string[]) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const renderQuestion = (q: SurveyDef['questions'][0], answers: Record<string, string | string[]> | undefined, readOnly: boolean) => {
    const val = answers?.[q.key];
    if (q.type === 'text') {
      if (readOnly) return <p className="text-sm text-foreground">{val ? String(val) : '—'}</p>;
      return (
        <Input
          value={(formValues[q.key] as string) ?? ''}
          onChange={(e) => updateForm(q.key, e.target.value)}
          placeholder={q.label}
          className="mt-1"
        />
      );
    }
    if (q.type === 'single') {
      if (readOnly) {
        const opt = q.options?.find(o => o.value === val);
        return <p className="text-sm text-foreground">{opt?.label ?? (val ? String(val) : '—')}</p>;
      }
      return (
        <Select value={(formValues[q.key] as string) ?? ''} onValueChange={(v) => updateForm(q.key, v)}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={q.label} />
          </SelectTrigger>
          <SelectContent>
            {q.options?.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    // multi
    if (readOnly) {
      const arr = Array.isArray(val) ? val : (val ? [val] : []);
      const labels = arr.map(v => q.options?.find(o => o.value === v)?.label ?? v).filter(Boolean);
      return <p className="text-sm text-foreground">{labels.length ? labels.join(', ') : '—'}</p>;
    }
    const selected = (formValues[q.key] as string[] | undefined) ?? [];
    const max = survey.maxSelections ?? 2;
    return (
      <div className="space-y-2 mt-1">
        {q.options?.map(opt => (
          <label key={opt.value} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={(checked) => {
                const next = checked
                  ? [...selected, opt.value].slice(-max)
                  : selected.filter(x => x !== opt.value);
                updateForm(q.key, next);
              }}
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        A private reference where you fill out surveys about yourself. Your partner's answers appear when they've filled the same survey.
      </p>
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Stored only on your two devices</span>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Survey</Label>
        <Select value={surveyId} onValueChange={(v) => setSurveyId(v as BelovedSurveyId)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BELOVED_SURVEYS.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 border-primary/20">
          <h4 className="text-sm font-medium flex items-center gap-1 mb-3">
            <User className="w-4 h-4" />
            My Answers
          </h4>
          {survey.questions.map(q => (
            <div key={q.key} className="mb-4">
              <Label className="text-xs text-muted-foreground">{q.label}</Label>
              {renderQuestion(q, formValues as Record<string, string | string[]>, false)}
            </div>
          ))}
          <Button size="sm" onClick={handleSave} disabled={saving} className="mt-2">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Card>

        <Card className="p-4 bg-muted/30">
          <h4 className="text-sm font-medium flex items-center gap-1 mb-3">
            <User className="w-4 h-4" />
            My Beloved's Answers
          </h4>
          {partnerAnswers ? (
            survey.questions.map(q => (
              <div key={q.key} className="mb-4">
                <Label className="text-xs text-muted-foreground">{q.label}</Label>
                {renderQuestion(q, partnerAnswers.answers, true)}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">They went first — when they fill this survey, their answers will appear here.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
