import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`flex h-10 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring focus:border-transparent transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${error ? "border-destructive/40 focus:ring-destructive/40" : ""} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
export type { InputProps };
