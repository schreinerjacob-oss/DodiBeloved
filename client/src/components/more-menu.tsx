import { useLocation } from 'wouter';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface MoreMenuItem {
  href: string;
  icon: any;
  label: string;
}

export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [, setLocation] = useLocation();
  const [location] = useLocation();

  const handleNavigate = (href: string) => {
    setLocation(href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover-elevate"
          data-testid="button-more-menu"
        >
          <MoreVertical className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <DropdownMenuItem
              key={item.href}
              onClick={() => handleNavigate(item.href)}
              className={cn('cursor-pointer', isActive && 'bg-accent')}
              data-testid={`menu-${item.label.toLowerCase()}`}
            >
              <Icon className="w-4 h-4 mr-2" />
              <span>{item.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
