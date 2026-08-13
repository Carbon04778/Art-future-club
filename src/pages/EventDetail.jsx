import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Image } from '@/components/ui/image';
import { ArrowLeft, MapPin, Clock, ExternalLink, Calendar, Loader2 } from 'lucide-react';
import SlimFooter from '@/components/SlimFooter';

const TYPE_COLORS = {
  Exhibition: 'bg-primary/10 text-primary',
  Opening: 'bg-yellow-100 text-yellow-700',
  Talk: 'bg-purple-100 text-purple-700',
  Workshop: 'bg-green-100 text-green-700',
  Screening: 'bg-blue-100 text-blue-700',
  Performance: 'bg-pink-100 text-pink-700',
  Social: 'bg-orange-100 text-orange-700',
  Other: 'bg-muted text-muted-foreground',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    base44.entities.Event.get(id)
      .then((ev) => {
        setEvent(ev);
        setLoading(false);
        if (!ev) setNotFound(true);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (notFound || !event) {
    return (
      <>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <p className="font-mono-caps text-[11px] text-muted-foreground">404 — Event not found</p>
          <Link to="/events" className="mt-4 inline-flex items-center gap-2 font-heading text-2xl hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to Events
          </Link>
        </div>
      </>
    );
  }

  const isPast = event.start_date && new Date(event.start_date) < new Date();

  return (
    <>

      <div className="px-6 pt-10 md:px-10">
        <button
          onClick={() => navigate('/events')}
          className="inline-flex items-center gap-2 font-mono-caps text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All Events
        </button>
      </div>

      {/* hero */}
      <section className="px-6 py-12 md:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`font-mono-caps text-[10px] px-2 py-0.5 ${TYPE_COLORS[event.event_type] || TYPE_COLORS.Other}`}>
            {event.event_type}
          </span>
          {event.chapter && (
            <span className="font-mono-caps text-[10px] text-muted-foreground">{event.chapter}</span>
          )}
          {isPast && (
            <span className="font-mono-caps text-[10px] text-muted-foreground/70">Past event</span>
          )}
          {event.is_free ? (
            <span className="font-mono-caps text-[10px] text-green-600">Free</span>
          ) : (
            event.ticket_price && <span className="font-mono-caps text-[10px] text-muted-foreground">{event.ticket_price}</span>
          )}
        </div>

        <h1 className="mt-5 max-w-4xl font-heading text-5xl font-medium leading-[1.02] tracking-[-0.02em] md:text-7xl">
          {event.title}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono-caps text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {formatDate(event.start_date)}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {formatTime(event.start_date)}</span>
          {event.venue && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venue, event.address].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-primary"
            >
              <MapPin className="h-3 w-3" /> {event.venue}{event.address ? `, ${event.address}` : ''}
            </a>
          )}
        </div>
      </section>

      {/* image */}
      {event.image_url && (
        <section className="px-6 md:px-10">
          <div className="overflow-hidden" data-artwork>
            <Image src={event.image_url} alt={event.title} fittingType="fill" className="aspect-[16/9] w-full" />
          </div>
        </section>
      )}

      {/* body + sidebar */}
      <section className="px-6 py-14 md:px-10">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[2fr_1fr]">
          <div>
            {event.description && (
              <p className="text-lg leading-relaxed whitespace-pre-line">{event.description}</p>
            )}
          </div>
          <aside className="border border-border p-6 h-fit space-y-5">
            {event.organizer_name && (
              <div>
                <p className="font-mono-caps text-[10px] text-muted-foreground">Organised by</p>
                <p className="mt-1 text-base">{event.organizer_name}</p>
              </div>
            )}
            {event.end_date && (
              <div>
                <p className="font-mono-caps text-[10px] text-muted-foreground">Ends</p>
                <p className="mt-1 text-base">{formatDate(event.end_date)} · {formatTime(event.end_date)}</p>
              </div>
            )}
            {event.external_link && (
              <a
                href={event.external_link}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 bg-primary px-5 py-3 font-mono-caps text-[11px] text-primary-foreground transition-opacity hover:opacity-80"
              >
                <ExternalLink className="h-3 w-3" /> Open Event Page
              </a>
            )}
            <Link
              to="/events"
              className="block text-center font-mono-caps text-[11px] text-muted-foreground hover:text-primary"
            >
              ← Back to programme
            </Link>
          </aside>
        </div>
      </section>

      <SlimFooter />
    </>
  );
}