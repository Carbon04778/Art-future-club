import React from "react";
import { Link } from "react-router-dom";

export default function AfcAuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex bg-background">
      {/* left — brand panel */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-foreground px-12 py-10 text-background">
        <Link to="/" className="inline-flex items-center hover:opacity-80">
          <img
            src="/images/artfuture.png"
            alt="Art Future Club"
            className="h-14 w-auto"
          />
        </Link>
        <div>
          <p className="font-mono-caps text-[11px] text-background/40">Global Community</p>
          <h2 className="mt-4 font-heading text-[6vw] font-medium leading-[0.9] tracking-[-0.03em]">
            Boardless<br />
            <span className="outlined-text-light">Connectivity</span>
          </h2>
          <p className="mt-8 max-w-xs text-base text-background/60 leading-relaxed">
            Join an international <span className="text-primary">network</span> of <span className="text-accent">artists, curators, galleries</span> and collectors shaping the contemporary art <span className="text-highlight">dialogue</span>, city by city.
          </p>
        </div>
        <p className="font-mono-caps text-[10px] text-background/30">
          © MMXXVI Art Future Club
        </p>
      </div>

      {/* right — form panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-md mx-auto">
          <Link to="/" className="lg:hidden mb-10 inline-block hover:opacity-80">
            <img
              src="/images/artfuture.png"
              alt="Art Future Club"
              className="h-9 w-auto"
            />
          </Link>
          <p className="font-mono-caps text-[11px] text-primary">Art Future Club — Network</p>
          <h1 className="mt-3 font-heading text-4xl font-medium tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>}
          <div className="mt-10">{children}</div>
          {footer && (
            <p className="mt-8 text-sm text-muted-foreground">{footer}</p>
          )}
        </div>
      </div>
    </div>
  );
}