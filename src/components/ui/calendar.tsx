import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type CalendarDay, WEEKDAY_LABELS } from "@/lib/calendar-grid";
import { formatCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type CalendarProps = {
  monthLabel: string;
  grid: readonly CalendarDay[];
  selected: string;
  today: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrevYear: () => void;
  onNextYear: () => void;
  onSelect: (date: string) => void;
};

const dayLabel = (day: CalendarDay, isToday: boolean) =>
  `${formatCalendarDate(day.date)}${isToday ? ", today" : ""}`;

// Presentational month view; state and grid come from useDatePicker.
export const Calendar = ({
  monthLabel,
  grid,
  selected,
  today,
  onPrevMonth,
  onNextMonth,
  onPrevYear,
  onNextYear,
  onSelect,
}: CalendarProps) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-2">
      <div className="flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPrevYear}
          aria-label="Previous year"
        >
          <ChevronsLeft />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPrevMonth}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
      </div>
      <p className="text-sm font-semibold tracking-tight" aria-live="polite">
        {monthLabel}
      </p>
      <div className="flex">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onNextMonth}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onNextYear}
          aria-label="Next year"
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center">
      {WEEKDAY_LABELS.map((weekday) => (
        <span
          key={weekday}
          className="py-1 text-xs font-medium text-muted-foreground"
          aria-hidden
        >
          {weekday}
        </span>
      ))}
      {grid.map((day) => {
        const isSelected = day.date === selected;
        const isToday = day.date === today;
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelect(day.date)}
            aria-label={dayLabel(day, isToday)}
            aria-pressed={isSelected}
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors outline-none hover:bg-secondary hover:text-secondary-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              !day.inMonth && "text-muted-foreground/60",
              isToday && "font-semibold text-primary ring-1 ring-primary/40",
              isSelected &&
                "bg-primary font-semibold text-primary-foreground shadow-sm ring-0 shadow-primary/30 hover:bg-primary hover:text-primary-foreground",
            )}
          >
            {day.day}
          </button>
        );
      })}
    </div>
  </div>
);
