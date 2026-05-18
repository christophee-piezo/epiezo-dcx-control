import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '../../lib/utils.js';

export function CheckboxSelect({
  buttonClassName,
  defaultValue,
  defaultValues,
  id,
  menuLabel,
  menuLabelKey,
  multiple = false,
  options = []
}) {
  const initialValues = Array.isArray(defaultValues) && defaultValues.length
    ? defaultValues
    : [defaultValue || options[0]?.value || ''];
  const [selectedValues, setSelectedValues] = useState(initialValues.filter(Boolean));
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  const resolvedSelectedOptions = useMemo(() => {
    const matches = options.filter((option) => selectedValues.includes(option.value));
    return matches.length ? matches : (options[0] ? [options[0]] : []);
  }, [options, selectedValues]);

  const buttonLabel = useMemo(() => {
    if (!resolvedSelectedOptions.length) {
      return '';
    }

    if (!multiple || resolvedSelectedOptions.length === 1) {
      return resolvedSelectedOptions[0].label;
    }

    return `${resolvedSelectedOptions[0].label} +${resolvedSelectedOptions.length - 1}`;
  }, [multiple, resolvedSelectedOptions]);

  const buttonLabelKey = !multiple || resolvedSelectedOptions.length === 1
    ? resolvedSelectedOptions[0]?.labelKey
    : null;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!inputRef.current) {
      return undefined;
    }

    const syncDisabledState = () => {
      const nextDisabled = Boolean(inputRef.current?.disabled);
      setDisabled(nextDisabled);
      if (nextDisabled) {
        setOpen(false);
      }
    };

    syncDisabledState();

    const observer = new MutationObserver(syncDisabledState);
    observer.observe(inputRef.current, {
      attributes: true,
      attributeFilter: ['disabled']
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  function emitChange() {
    window.requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function handleOptionSelect(nextValue) {
    if (!multiple) {
      if (nextValue !== selectedValues[0]) {
        setSelectedValues([nextValue]);
        emitChange();
      }

      setOpen(false);
      return;
    }

    const alreadySelected = selectedValues.includes(nextValue);
    if (alreadySelected && selectedValues.length === 1) {
      return;
    }

    const nextSelectedValues = alreadySelected
      ? selectedValues.filter((value) => value !== nextValue)
      : [...selectedValues, nextValue];

    const orderedSelectedValues = options
      .map((option) => option.value)
      .filter((value) => nextSelectedValues.includes(value));

    setSelectedValues(orderedSelectedValues);
    emitChange();
  }

  const primaryValue = selectedValues[0] || options[0]?.value || '';
  const serializedValues = selectedValues.join(',');

  return (
    <div className="relative" ref={rootRef}>
      <input data-selected-values={serializedValues} id={id} readOnly ref={inputRef} type="hidden" value={primaryValue} />
      <button
        aria-expanded={open}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-cyan-600/70 bg-white px-4 py-2 text-left text-base font-medium text-slate-700 shadow-[0_10px_24px_-18px_rgba(8,145,178,0.55)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none',
          buttonClassName
        )}
        onClick={() => {
          if (!disabled) {
            setOpen((currentOpen) => !currentOpen);
          }
        }}
        type="button"
      >
        <span className="truncate" data-i18n={buttonLabelKey}>{buttonLabel}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', open ? 'rotate-180' : '')} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-3 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_50px_-24px_rgba(15,23,42,0.35),0_8px_18px_-12px_rgba(15,23,42,0.22)]">
          <div className="px-5 pb-2 pt-4 text-base font-semibold text-slate-500" data-i18n={menuLabelKey}>{menuLabel}</div>
          <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);

              return (
                <button
                  aria-selected={isSelected}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-3 text-left text-[1.02rem] transition-colors',
                    isSelected
                      ? 'bg-slate-50 text-cyan-700'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  )}
                  key={option.value}
                  onClick={() => handleOptionSelect(option.value)}
                  role="option"
                  type="button"
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                      isSelected
                        ? 'border-cyan-600 bg-cyan-600 text-white'
                        : 'border-slate-300 bg-white text-transparent'
                    )}
                  >
                    <Check className="size-4" />
                  </span>
                  <span data-i18n={option.labelKey}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
