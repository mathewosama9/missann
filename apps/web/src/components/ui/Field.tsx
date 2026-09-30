import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}

const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);

// الـ label مربوط بحقله (htmlFor/id) لقارئات الشاشة والنقر، حين يكون الابن حقلاً واحداً
export function Field({ label, error, children, hint }: FieldProps) {
  const autoId = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const linkable = only !== null && typeof only.type === 'string' && FORM_CONTROLS.has(only.type);
  const id = linkable ? (only.props.id ?? autoId) : undefined;

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {linkable && only && !only.props.id ? cloneElement(only, { id }) : children}
      {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
