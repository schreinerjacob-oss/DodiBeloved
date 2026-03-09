import { Check, CheckCheck, Clock, Loader2 } from 'lucide-react';

export type MessageStatusValue = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | undefined;

export function MessageStatus({ status }: { status: MessageStatusValue }) {
  if (status === 'queued') return <Clock className="w-3 h-3 text-amber-500" />;
  if (status === 'sending') return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
  if (status === 'sent') return <Check className="w-3 h-3 text-muted-foreground" />;
  if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-blue-400" />;
  if (status === 'read') return <CheckCheck className="w-3 h-3 text-accent" />;
  return <Check className="w-3 h-3 text-muted-foreground" />;
}

