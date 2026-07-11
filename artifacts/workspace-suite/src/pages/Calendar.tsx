import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Star } from 'lucide-react';

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

type Day = {
  n: number;
  muted?: boolean;
  underline?: boolean;
};

const weeks: Day[][] = [
  [{ n: 29, muted: true }, { n: 30, muted: true }, { n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }],
  [{ n: 6 }, { n: 7 }, { n: 8 }, { n: 9 }, { n: 10 }, { n: 11 }, { n: 12 }],
  [{ n: 13 }, { n: 14 }, { n: 15 }, { n: 16 }, { n: 17 }, { n: 18 }, { n: 19 }],
  [{ n: 20 }, { n: 21 }, { n: 22 }, { n: 23 }, { n: 24 }, { n: 25, underline: true }, { n: 26 }],
  [{ n: 27 }, { n: 28 }, { n: 29 }, { n: 30 }, { n: 31, underline: true }, { n: 1, muted: true }, { n: 2, muted: true }],
  [
    { n: 3, muted: true },
    { n: 4, muted: true },
    { n: 5, muted: true },
    { n: 6, muted: true },
    { n: 7, muted: true },
    { n: 8, muted: true },
    { n: 9, muted: true },
  ],
];

type EventItem = {
  title: string;
  time: string;
  highlighted?: boolean;
};

const eventsByDay: Record<number, EventItem[]> = {
  15: [
    { title: 'TEDx Talk (2016 web design trends)', time: '14:00 PM - 16:30 PM' },
    { title: 'Buy a new telescope', time: '17:00 PM - 17:30 PM' },
    { title: 'Buy tickets for Star Wars movie', time: '18:00 PM - 18:30 PM', highlighted: true },
    { title: 'Visit my Grandparents', time: '19:00 PM - 21:30 PM' },
    { title: 'Dinner with my girlfriend', time: '22:00 PM - 23:30 PM' },
    { title: 'Plans for tomorrow', time: '23:50 PM - 00:20 PM' },
  ],
  25: [{ title: 'Team offsite planning', time: '10:00 AM - 12:00 PM' }],
  31: [
    { title: "New Year's Eve prep", time: '20:00 PM - 23:59 PM' },
    { title: 'Countdown with friends', time: '23:59 PM - 00:30 AM' },
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

export function CalendarPage() {
  const [selected, setSelected] = useState(15);
  const events = eventsByDay[selected] ?? [];

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 h-[380px] w-[380px] rounded-full bg-gradient-to-br from-lime-300 via-emerald-400 to-transparent opacity-50 blur-3xl" />
        <div className="absolute -bottom-28 -right-20 h-[460px] w-[460px] rounded-full bg-gradient-to-tr from-teal-300 via-emerald-400 to-transparent opacity-50 blur-3xl" />
      </div>

      <div className="relative flex min-h-[calc(100vh-4rem)] w-full bg-white shadow-2xl ring-1 ring-black/5">
        <div className="relative z-10 w-[430px] shrink-0 bg-white p-8 shadow-[0_10px_40px_-10px_rgba(16,60,40,0.25)]">
          <div className="flex items-center justify-between">
            <button className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-[16px] font-semibold text-gray-800">December 2015</h2>
            <button className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6 grid grid-cols-7 gap-y-3 text-center">
            {weekdays.map((d) => (
              <span key={d} className="text-[11px] font-medium tracking-wide text-gray-400">
                {d}
              </span>
            ))}

            {weeks.map((week, wi) =>
              week.map((day, di) => {
                const isSelected = !day.muted && day.n === selected;
                return (
                  <div key={`${wi}-${di}`} className="flex items-center justify-center py-1.5">
                    {isSelected ? (
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-emerald-600 text-[13px] font-semibold text-white shadow-md shadow-emerald-500/40">
                        {day.n}
                      </span>
                    ) : (
                      <button
                        disabled={day.muted}
                        onClick={() => setSelected(day.n)}
                        className={`relative text-[13px] transition-colors ${
                          day.muted
                            ? 'cursor-default text-gray-300'
                            : 'text-gray-600 hover:text-emerald-600'
                        }`}
                      >
                        {day.n}
                        {day.underline && (
                          <span className="absolute -bottom-1 left-0 h-[2px] w-full bg-emerald-500" />
                        )}
                      </button>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-green-600 p-8 text-white">
          <div>
            <h2 className="text-[22px] font-semibold">{dayOfWeekLabel(selected)}</h2>
            <p className="mt-0.5 text-[12px] text-emerald-100/60">{selected}th December 2015</p>
          </div>

          <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-[13px] text-emerald-100/60">No events scheduled for this day.</p>
            ) : (
              events.map((event, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                    event.highlighted ? 'bg-gradient-to-r from-lime-400 to-emerald-500' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        event.highlighted ? 'bg-white' : 'bg-emerald-300'
                      }`}
                    />
                    <div>
                      <p className="text-[13px] font-medium text-white">{event.title}</p>
                      <p
                        className={`text-[11px] ${
                          event.highlighted ? 'text-emerald-50/90' : 'text-emerald-100/50'
                        }`}
                      >
                        {event.time}
                      </p>
                    </div>
                  </div>
                  {event.highlighted && <Star className="h-4 w-4 shrink-0 fill-white text-white" />}
                </div>
              ))
            )}
          </div>

          <button className="absolute -bottom-5 -right-5 flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700 shadow-lg shadow-emerald-900/30 transition-transform hover:scale-105">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default CalendarPage;
