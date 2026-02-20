import { useState, useEffect } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getQuestionsByPath, PATH_LABELS, PATH_COUNTS } from '@/lib/moment-questions';
import { getMomentQuestionProgress, saveMomentQuestionProgress } from '@/lib/storage-encrypted';
import type { MomentQuestionProgress } from '@/types';

export function MakingNewMomentsTab() {
  const { userId, partnerId } = useDodi();
  const [path, setPath] = useState<1 | 2 | 3>(1);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<MomentQuestionProgress | null>(null);

  const questions = getQuestionsByPath(path);
  const total = PATH_COUNTS[path];
  const question = questions[index] ?? null;

  useEffect(() => {
    if (userId && partnerId) {
      getMomentQuestionProgress(userId, partnerId, path).then(p => {
        setProgress(p);
        if (p && p.lastQuestionIndex >= 0 && p.lastQuestionIndex < total) {
          setIndex(p.lastQuestionIndex);
        } else {
          setIndex(0);
        }
      });
    }
  }, [userId, partnerId, path, total]);

  const handlePrev = () => {
    const next = Math.max(0, index - 1);
    setIndex(next);
    persistProgress(next);
  };

  const handleNext = () => {
    const next = Math.min(total - 1, index + 1);
    setIndex(next);
    persistProgress(next);
  };

  const persistProgress = (idx: number) => {
    if (!userId || !partnerId) return;
    const id = `${userId}-${partnerId}-${path}`;
    const p: MomentQuestionProgress = {
      id,
      userId,
      partnerId,
      path,
      lastQuestionIndex: idx,
      updatedAt: new Date(),
    };
    saveMomentQuestionProgress(p);
    setProgress(p);
  };

  const handlePathChange = (v: string) => {
    const p = parseInt(v, 10) as 1 | 2 | 3;
    setPath(p);
    setIndex(0);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Progressive questions for date nights or quiet evenings — talk, laugh, and discover each other.
      </p>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Path</label>
        <Select value={String(path)} onValueChange={handlePathChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{PATH_LABELS[1]} (35)</SelectItem>
            <SelectItem value="2">{PATH_LABELS[2]} (35)</SelectItem>
            <SelectItem value="3">{PATH_LABELS[3]} (30)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {question ? (
        <Card className="p-6 space-y-4 border-primary/20">
          <p className="text-sm text-muted-foreground">
            {index + 1} / {total}
          </p>
          <p className="text-lg font-light text-foreground leading-relaxed">{question.text}</p>
          {question.example && (
            <p className="text-sm text-muted-foreground italic">e.g. {question.example}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={index === 0}>
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleNext} disabled={index >= total - 1}>
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center text-muted-foreground">
          <p>Select a path to see questions.</p>
        </Card>
      )}
    </div>
  );
}
