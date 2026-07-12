import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type Day = { n: number; muted?: boolean; underline?: boolean };

const weeks: Day[][] = [
  [{ n: 29, muted: true }, { n: 30, muted: true }, { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }],
  [{ n: 6 }, { n: 7 }, { n: 8 }, { n: 9 }, { n: 10 }, { n: 11 }, { n: 12 }],
  [{ n: 13 }, { n: 14 }, { n: 15 }, { n: 16 }, { n: 17 }, { n: 18 }, { n: 19 }],
  [{ n: 20 }, { n: 21 }, { n: 22 }, { n: 23 }, { n: 24 }, { n: 25, underline: true }, { n: 26 }],
  [{ n: 27 }, { n: 28 }, { n: 29 }, { n: 30 }, { n: 31, underline: true }, { n: 1, muted: true }, { n: 2, muted: true }],
  [{ n: 3, muted: true }, { n: 4, muted: true }, { n: 5, muted: true }, { n: 6, muted: true }, { n: 7, muted: true }, { n: 8, muted: true }, { n: 9, muted: true }],
];

type EventItem = { title: string; time: string; highlighted?: boolean };

const eventsByDay: Record<number, EventItem[]> = {
  15: [
    { title: 'TEDx Talk (2016 web design trends)', time: '14:00 PM – 16:30 PM' },
    { title: 'Buy a new telescope', time: '17:00 PM – 17:30 PM' },
    { title: 'Buy tickets for Star Wars movie', time: '18:00 PM – 18:30 PM', highlighted: true },
    { title: 'Visit my Grandparents', time: '19:00 PM – 21:30 PM' },
    { title: 'Dinner with my girlfriend', time: '22:00 PM – 23:30 PM' },
    { title: 'Plans for tomorrow', time: '23:50 PM – 00:20 AM' },
  ],
  25: [{ title: 'Team offsite planning', time: '10:00 AM – 12:00 PM' }],
  31: [
    { title: "New Year's Eve prep", time: '20:00 PM – 23:59 PM' },
    { title: 'Countdown with friends', time: '23:59 PM – 00:30 AM' },
  ],
};

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfWeekLabel(day: number) {
  for (const week of weeks) {
    const idx = week.findIndex((d) => d.n === day && !d.muted);
    if (idx !== -1) return dayNames[idx];
  }
  return dayNames[2];
}

export function Calendar() {
  const [selected, setSelected] = useState(15);
  const events = eventsByDay[selected] ?? [];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">
      {/* ── Left: calendar grid ── */}
      <div className="w-[400px] shrink-0 border-r border-black/8 bg-white p-8">
        <div className="flex items-center justify-between">
          <button className="flex h-7 w-7 items-center justify-center text-black/30 hover:text-black transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[16px] font-semibold text-gray-900">December 2015</h2>
          <button className="flex h-7 w-7 items-center justify-center text-black/30 hover:text-black transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-7 gap-y-3 text-center">
          {weekdays.map((d) => (
            <span key={d} className="text-[11px] font-medium tracking-wide text-black/35">
              {d}
            </span>
          ))}

          {weeks.map((week, wi) =>
            week.map((day, di) => {
              const isSelected = !day.muted && day.n === selected;
              return (
                <div key={`${wi}-${di}`} className="flex items-center justify-center py-1.5">
                  {isSelected ? (
                    <span className="flex h-9 w-9 items-center justify-center bg-[#2ecc71] text-[13px] font-semibold text-white">
                      {day.n}
                    </span>
                  ) : (
                    <button
                      disabled={day.muted}
                      onClick={() => setSelected(day.n)}
                      className={`relative text-[13px] transition-colors ${
                        day.muted
                          ? 'cursor-default text-black/20'
                          : 'text-gray-600 hover:text-[#2ecc71]'
                      }`}
                    >
                      {day.n}
                      {day.underline && (
                        <span className="absolute -bottom-1 left-0 h-[2px] w-full bg-[#2ecc71]" />
                      )}
                    </button>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* ── Right: events panel ── */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white p-8">
        <div>
          <h2 className="text-[22px] font-semibold text-gray-900">{dayOfWeekLabel(selected)}</h2>
          <p className="mt-0.5 text-[12px] text-black/35">{selected}th December 2015</p>
        </div>

        <div className="relative mt-8 flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-[13px] text-black/35">No events scheduled for this day.</p>
          ) : (
            /* Vertical timeline at left edge */
            <div className="relative pl-5">
              {/* continuous vertical line */}
              <div className="absolute left-[6px] top-2 bottom-2 w-px bg-black/10" />

              <div className="flex flex-col gap-6">
                {events.map((event, i) => (
                  <div key={i} className="relative">
                    {/* dot node */}
                    <span
                      className={`absolute -left-[17px] top-[4px] h-[7px] w-[7px] rounded-full ${
                        event.highlighted
                          ? 'bg-[#2ecc71]'
                          : 'bg-white border border-black/25'
                      }`}
                    />

                    {/* time */}
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35 mb-[3px]">
                      {event.time}
                    </p>

                    {/* title */}
                    <p
                      className={`text-[13px] font-medium leading-snug ${
                        event.highlighted ? 'text-[#2ecc71]' : 'text-gray-800'
                      }`}
                    >
                      {event.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FAB */}
        <button className="absolute bottom-6 right-6 flex h-12 w-12 items-center justify-center bg-[#2ecc71] text-white shadow-lg transition-transform hover:scale-105">
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

export default Calendar;
