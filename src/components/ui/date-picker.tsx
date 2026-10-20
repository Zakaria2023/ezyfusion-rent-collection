"use client";

import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDatePicker } from "./use-date-picker";

type DatePickerProps = {
  id?: string;
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

export const DatePicker = ({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  invalid,
  disabled,
  className,
}: DatePickerProps) => {
  const picker = useDatePicker({ value, onChange });

  return (
    <Popover open={picker.open} onOpenChange={picker.onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid ? true : undefined}
            className={cn(
              "w-full justify-start font-normal dark:bg-input/30",
              className,
            )}
          />
        }
      >
        <CalendarDays className="text-muted-foreground" />
        <span
          className={cn("truncate", !picker.label && "text-muted-foreground")}
        >
          {picker.label ?? placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          monthLabel={picker.monthLabel}
          grid={picker.grid}
          selected={picker.selected}
          today={picker.today}
          onPrevMonth={picker.prevMonth}
          onNextMonth={picker.nextMonth}
          onPrevYear={picker.prevYear}
          onNextYear={picker.nextYear}
          onSelect={picker.selectDate}
        />
        <div className="mt-3 flex justify-end border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={picker.selectToday}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
