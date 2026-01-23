import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Check, AlertTriangle, X, RefreshCw, Lock, Database, Wifi, Server, KeyRound } from 'lucide-react';
import { runFullPrivacyCheck, type PrivacyReport, type PrivacyCheckResult } from '@/lib/privacy-check';
import { cn } from '@/lib/utils';

const iconMap: Record<string, typeof Shield> = {
  'encryption': KeyRound,
  'local-storage': Database,
  'p2p-connection': Wifi,
  'relay-status': Server,
  'no-server-leaks': Lock,
  'data-encrypted': Shield,
};

function CheckItem({ check, index }: { check: PrivacyCheckResult; index: number }) {
  const Icon = iconMap[check.id] || Shield;
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (check.status === 'passed') {
      const timer = setTimeout(() => setAnimate(true), index * 150);
      return () => clearTimeout(timer);
    }
  }, [check.status, index]);

  return (
    <div 
      className={cn(
        "flex items-start gap-3 py-3 px-4 rounded-lg transition-all duration-300",
        check.status === 'passed' && "bg-sage/10",
        check.status === 'warning' && "bg-gold/10",
        check.status === 'failed' && "bg-destructive/10",
        check.status === 'checking' && "bg-muted/50"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500",
        check.status === 'passed' && "bg-sage/20",
        check.status === 'warning' && "bg-gold/20",
        check.status === 'failed' && "bg-destructive/20",
        check.status === 'checking' && "bg-muted",
        animate && "scale-110"
      )}>
        {check.status === 'checking' && (
          <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
        )}
        {check.status === 'passed' && (
          <Check className={cn(
            "w-4 h-4 text-sage transition-all duration-300",
            animate && "scale-125"
          )} />
        )}
        {check.status === 'warning' && (
          <AlertTriangle className="w-4 h-4 text-gold" />
        )}
        {check.status === 'failed' && (
          <X className="w-4 h-4 text-destructive" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "w-4 h-4",
            check.status === 'passed' && "text-sage",
            check.status === 'warning' && "text-gold",
            check.status === 'failed' && "text-destructive",
            check.status === 'checking' && "text-muted-foreground"
          )} />
          <h4 className="font-medium text-sm">{check.label}</h4>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{check.description}</p>
        {check.detail && (
          <p className={cn(
            "text-[10px] mt-1 font-mono",
            check.status === 'passed' && "text-sage",
            check.status === 'warning' && "text-gold",
            check.status === 'failed' && "text-destructive"
          )}>
            {check.detail}
          </p>
        )}
      </div>
    </div>
  );
}

export function PrivacyHealthCheck() {
  const [report, setReport] = useState<PrivacyReport | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const runVerification = async () => {
    setIsVerifying(true);
    setHasRun(true);
    
    const initialChecks = [
      { id: 'encryption', label: 'End-to-End Encryption', description: 'AES-GCM 256-bit encryption is active', status: 'checking' as const },
      { id: 'local-storage', label: 'Local Storage Only', description: 'All data stored on your device', status: 'checking' as const },
      { id: 'p2p-connection', label: 'Direct P2P Connection', description: 'Device-to-device communication', status: 'checking' as const },
      { id: 'relay-status', label: 'Signaling Relay', description: 'Wake-up ping configuration', status: 'checking' as const },
      { id: 'no-server-leaks', label: 'No Server Data', description: 'No data sent to external servers', status: 'checking' as const },
      { id: 'data-encrypted', label: 'Data At Rest', description: 'Stored data is encrypted', status: 'checking' as const },
    ];
    
    setReport({ checks: initialChecks, overallStatus: 'secure', timestamp: Date.now() });
    
    await new Promise(r => setTimeout(r, 500));
    
    const result = await runFullPrivacyCheck();
    setReport(result);
    setIsVerifying(false);
  };

  const getStatusBadge = () => {
    if (!report || isVerifying) return null;
    
    const statusConfig = {
      secure: { 
        label: 'Fully Secure', 
        icon: Shield, 
        className: 'bg-sage/20 text-sage border-sage/30' 
      },
      warning: { 
        label: 'Minor Issues', 
        icon: AlertTriangle, 
        className: 'bg-gold/20 text-gold border-gold/30' 
      },
      insecure: { 
        label: 'Action Needed', 
        icon: X, 
        className: 'bg-destructive/20 text-destructive border-destructive/30' 
      },
    };
    
    const config = statusConfig[report.overallStatus];
    const Icon = config.icon;
    
    return (
      <div className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
        config.className
      )}>
        <Icon className="w-3.5 h-3.5" />
        {config.label}
      </div>
    );
  };

  return (
    <Card className="p-6 space-y-4 border-sage/20 bg-sage/5" data-testid="card-privacy-health-check">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            report?.overallStatus === 'secure' && "bg-sage/20",
            report?.overallStatus === 'warning' && "bg-gold/20",
            report?.overallStatus === 'insecure' && "bg-destructive/20",
            !report && "bg-muted"
          )}>
            <Shield className={cn(
              "w-5 h-5",
              report?.overallStatus === 'secure' && "text-sage",
              report?.overallStatus === 'warning' && "text-gold",
              report?.overallStatus === 'insecure' && "text-destructive",
              !report && "text-muted-foreground"
            )} />
          </div>
          <div>
            <h3 className="font-medium">Privacy Health Check</h3>
            <p className="text-xs text-muted-foreground">
              {hasRun ? 'Verify your sanctuary is secure' : 'Run a security verification'}
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {!hasRun && (
        <div className="pt-3 border-t border-sage/10">
          <p className="text-sm text-muted-foreground mb-4">
            Run a comprehensive check to verify that your privacy protections are active and working correctly.
          </p>
          <Button 
            onClick={runVerification} 
            className="w-full bg-sage hover:bg-sage/90 text-white"
            data-testid="button-verify-privacy"
          >
            <Shield className="w-4 h-4 mr-2" />
            Verify My Privacy
          </Button>
        </div>
      )}

      {hasRun && report && (
        <div className="pt-3 border-t border-sage/10 space-y-2">
          {report.checks.map((check, index) => (
            <CheckItem key={check.id} check={check} index={index} />
          ))}
          
          <div className="pt-4 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Last verified: {new Date(report.timestamp).toLocaleTimeString()}
            </p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={runVerification}
              disabled={isVerifying}
              data-testid="button-reverify-privacy"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isVerifying && "animate-spin")} />
              {isVerifying ? 'Verifying...' : 'Verify Again'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
