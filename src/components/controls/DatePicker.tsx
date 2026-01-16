
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Helpers
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const formatForLocale = (date: Date, locale: string, granularity: string = 'day') => {
    const options: Intl.DateTimeFormatOptions = {};
    if (granularity === 'year') {
        options.year = 'numeric';
    } else if (granularity === 'quarter') {
        // Quarter is tricky for Intl, usually we format manually or use Month
        // For display we can show "Q1 2023" or similar
        const q = Math.floor(date.getMonth() / 3) + 1;
        return `Q${q} ${date.getFullYear()}`;
    } else if (granularity === 'month') {
        options.month = 'long';
        options.year = 'numeric';
    } else {
        // Day
        return new Intl.DateTimeFormat(locale).format(date);
    }
    return new Intl.DateTimeFormat(locale, options).format(date);
};

// Simple parser guessing based on parts
const parseLocaleDate = (input: string, locale: string): Date | null => {
    // We assume strict numeric parts separated by / or - or .
    const parts = input.match(/(\d+)/g);
    if (!parts) return null;

    if (parts.length === 1 && parts[0].length === 4) {
        // Year only
        return new Date(parseInt(parts[0], 10), 0, 1);
    }

    if (parts.length === 3) {
        // Full date logic (reused)
        const testDate = new Date(2000, 0, 30);
        const testFmt = new Intl.DateTimeFormat(locale).format(testDate);

        const part30 = testFmt.indexOf('30');
        const part01 = testFmt.indexOf('01');
        const part2000 = testFmt.indexOf('2000');

        const order = [
            { type: 'D', pos: part30 },
            { type: 'M', pos: part01 },
            { type: 'Y', pos: part2000 }
        ].sort((a, b) => a.pos - b.pos);

        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        const p3 = parseInt(parts[2], 10);

        let day = 0, month = 0, year = 0;

        if (order[0].type === 'D') day = p1;
        else if (order[0].type === 'M') month = p1;
        else year = p1;

        if (order[1].type === 'D') day = p2;
        else if (order[1].type === 'M') month = p2;
        else year = p2;

        if (order[2].type === 'D') day = p3;
        else if (order[2].type === 'M') month = p3;
        else year = p3;

        if (year < 100) year += 2000;
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
            return d;
        }
    }

    return null;
};

type ViewMode = 'decade' | 'year' | 'month' | 'day';

interface DatePickerProps {
    value: Date | null;
    onChange: (date: Date | null) => void;
    locale: string;
    granularity?: 'day' | 'month' | 'year' | 'quarter';
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, locale, granularity = 'day' }) => {
    const [text, setText] = useState('');
    const [showCalendar, setShowCalendar] = useState(false);

    // Calendar view state
    const [viewDate, setViewDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('day');

    const inputRef = useRef<HTMLInputElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);

    // Initial View Mode based on granularity
    useEffect(() => {
        if (granularity === 'year') setViewMode('decade');
        else if (granularity === 'month' || granularity === 'quarter') setViewMode('year');
        else setViewMode('day');
    }, [granularity]);

    // Sync Text with Value changes (external)
    useEffect(() => {
        if (value) {
            setText(formatForLocale(value, locale, granularity));
            setViewDate(value);
        } else {
            setText('');
        }
    }, [value, locale, granularity]);

    // Close on click outside (handling portal)
    useEffect(() => {
        if (!showCalendar) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (
                calendarRef.current &&
                !calendarRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setShowCalendar(false);
            }
        };

        // Use timeout to avoid immediate close if click triggered opening
        const timeout = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showCalendar]);

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setText(val);
        const date = parseLocaleDate(val, locale);
        if (date) {
            onChange(date);
            setViewDate(date);
        } else if (val.trim() === '') {
            onChange(null);
        }
    };

    const getPortalPosition = () => {
        if (!inputRef.current) return { top: 0, left: 0 };
        const rect = inputRef.current.getBoundingClientRect();
        return {
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
            minWidth: rect.width
        };
    };

    // --- Navigation & Selection Logic ---

    const handleHeaderClick = () => {
        // Zoom out
        if (viewMode === 'day') setViewMode('month');
        else if (viewMode === 'month') setViewMode('year');
        else if (viewMode === 'year') setViewMode('decade');
    };

    const handlePrev = () => {
        if (viewMode === 'day') {
            setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
        } else if (viewMode === 'month') {
            setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
        } else if (viewMode === 'year') {
            setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1)); // Actually year view usually shows 1 year, so prev is -1 year
        } else if (viewMode === 'decade') {
            setViewDate(new Date(viewDate.getFullYear() - 10, viewDate.getMonth(), 1));
        }
    };

    const handleNext = () => {
        if (viewMode === 'day') {
            setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
        } else if (viewMode === 'month') {
            setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
        } else if (viewMode === 'year') {
            setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
        } else if (viewMode === 'decade') {
            setViewDate(new Date(viewDate.getFullYear() + 10, viewDate.getMonth(), 1));
        }
    };

    const handleYearSelect = (year: number) => {
        const newDate = new Date(year, viewDate.getMonth(), 1);
        setViewDate(newDate);

        if (granularity === 'year') {
            onChange(newDate);
            setShowCalendar(false);
        } else {
            setViewMode('year'); // Drill down
        }
    };

    const handleMonthSelect = (month: number) => {
        const newDate = new Date(viewDate.getFullYear(), month, 1);
        setViewDate(newDate);

        if (granularity === 'month') {
            onChange(newDate);
            setShowCalendar(false);
        } else if (granularity === 'quarter') {
            // If quarter, selecting a month selects the quarter containing it? 
            // Or we should show quarters in Year view?
            // Simplification: In Year view show months, selecting month effectively selects that month's start, 
            // but if granularity is quarter, maybe we should just allow picking start months of quarters (Jan, Apr, Jul, Oct) 
            // OR show Quarter Grid. Let's do Quarter Grid if granularity=quarter.
            onChange(newDate);
            setShowCalendar(false);
        } else {
            setViewMode('day'); // Drill down
        }
    };

    const handleDaySelect = (d: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
        onChange(newDate);
        setShowCalendar(false);
    };

    // --- Renderers ---

    const renderDecade = () => {
        const currentYear = viewDate.getFullYear();
        const startYear = Math.floor(currentYear / 10) * 10;
        const years = [];
        for (let i = 0; i < 10; i++) {
            const y = startYear + i;
            const isSelected = value && value.getFullYear() === y;
            years.push(
                <div key={y}
                    onClick={() => handleYearSelect(y)}
                    style={{
                        padding: '10px', textAlign: 'center', cursor: 'pointer', borderRadius: '4px',
                        background: isSelected ? 'var(--primary-color)' : 'transparent',
                        color: isSelected ? 'white' : 'var(--text-main)'
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-panel-secondary)' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                    {y}
                </div>
            );
        }
        return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>{years}</div>;
    };

    const renderYear = () => {
        // If granularity is quarter, show Quarters instead of Months
        if (granularity === 'quarter') {
            const quarters = [
                { label: 'Q1', month: 0 }, { label: 'Q2', month: 3 },
                { label: 'Q3', month: 6 }, { label: 'Q4', month: 9 }
            ];
            return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                    {quarters.map(q => {
                        const isSelected = value && Math.floor(value.getMonth() / 3) === Math.floor(q.month / 3) && value.getFullYear() === viewDate.getFullYear();
                        return (
                            <div key={q.label}
                                onClick={() => handleMonthSelect(q.month)}
                                style={{
                                    padding: '15px', textAlign: 'center', cursor: 'pointer', borderRadius: '4px',
                                    background: isSelected ? 'var(--primary-color)' : 'transparent',
                                    color: isSelected ? 'white' : 'var(--text-main)'
                                }}
                                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-panel-secondary)' }}
                                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                            >
                                {q.label}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Standard Months
        const months = [];
        for (let i = 0; i < 12; i++) {
            const date = new Date(viewDate.getFullYear(), i, 1);
            const monthName = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
            const isSelected = value && value.getMonth() === i && value.getFullYear() === viewDate.getFullYear();
            months.push(
                <div key={i}
                    onClick={() => handleMonthSelect(i)}
                    style={{
                        padding: '10px', textAlign: 'center', cursor: 'pointer', borderRadius: '4px',
                        background: isSelected ? 'var(--primary-color)' : 'transparent',
                        color: isSelected ? 'white' : 'var(--text-main)'
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-panel-secondary)' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                    {monthName}
                </div>
            );
        }
        return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>{months}</div>;
    };

    const renderMonth = () => {
        // Only valid for 'day' granularity, renders days
        // NOTE: Our 'viewMode' naming is a bit confusing. 
        // viewMode='decade' -> Shows Years
        // viewMode='year' -> Shows Months (or Quarters)
        // viewMode='month' -> Shows Days is actually what we want for day selection?
        // Wait, standard convention:
        // Decade View => Select Year
        // Year View => Select Month
        // Month View => Select Day

        // This function renders the DAYS grid (Month View)
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);

        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} />);
        for (let i = 1; i <= daysInMonth; i++) {
            const isSelected = value && value.getDate() === i && value.getMonth() === month && value.getFullYear() === year;
            days.push(
                <div key={i} onClick={() => handleDaySelect(i)}
                    style={{
                        padding: '5px', textAlign: 'center', cursor: 'pointer', borderRadius: '3px',
                        background: isSelected ? 'var(--primary-color)' : 'transparent',
                        color: isSelected ? 'white' : 'var(--text-main)',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-panel-secondary)' }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                    {i}
                </div>
            );
        }
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', fontSize: '0.9em' }}>
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--text-secondary)' }}>{d}</div>)}
                {days}
            </div>
        );
    };

    const renderContent = () => {
        if (viewMode === 'decade') return renderDecade();
        if (viewMode === 'year') return renderYear();
        return renderMonth(); // 'day' viewMode means seeing days of a month
    };

    const getHeaderLabel = () => {
        if (viewMode === 'decade') {
            const start = Math.floor(viewDate.getFullYear() / 10) * 10;
            return `${start} - ${start + 9}`;
        }
        if (viewMode === 'year') {
            return `${viewDate.getFullYear()}`;
        }
        // Month view
        return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewDate);
    };

    const pos = getPortalPosition();

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex' }} ref={inputRef}>
                <input
                    type="text"
                    value={text}
                    onChange={handleTextChange}
                    onFocus={() => setShowCalendar(true)}
                    placeholder={granularity}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: 'var(--bg-input)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px 0 0 4px'
                    }}
                />
                <button
                    onClick={() => setShowCalendar(!showCalendar)}
                    style={{
                        padding: '0 10px',
                        background: 'var(--bg-panel-secondary)',
                        border: '1px solid var(--border-color)',
                        borderLeft: 'none',
                        borderRadius: '0 4px 4px 0',
                        cursor: 'pointer'
                    }}
                >
                    📅
                </button>
            </div>
            {showCalendar && createPortal(
                <div
                    ref={calendarRef}
                    style={{
                        position: 'absolute',
                        top: pos.top,
                        left: pos.left,
                        zIndex: 9999,
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '10px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                        width: '300px',
                        fontFamily: "'Inter', sans-serif"
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                        <button onClick={handlePrev} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-main)' }}>&lt;</button>
                        <span onClick={handleHeaderClick} style={{ fontWeight: 'bold', cursor: 'pointer', padding: '0 5px' }}>
                            {getHeaderLabel()}
                        </span>
                        <button onClick={handleNext} style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-main)' }}>&gt;</button>
                    </div>
                    {renderContent()}
                </div>,
                document.body
            )}
        </div>
    );
};
