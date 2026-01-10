
'use client';

import * as React from "react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, checked, onCheckedChange, ...props }, ref) => {
        return (
            <input
                type="checkbox"
                ref={ref}
                className={cn(
                    "h-4 w-4 shrink-0 rounded border-2 border-slate-300 focus:ring-2 focus:ring-primary accent-primary cursor-pointer transition-all",
                    className
                )}
                checked={checked}
                onChange={(e) => onCheckedChange?.(e.target.checked)}
                {...props}
            />
        );
    }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
