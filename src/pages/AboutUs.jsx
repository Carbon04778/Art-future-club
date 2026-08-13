import React from "react";
import ManifestoFooter from "@/components/ManifestoFooter";

export default function AboutUs() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-24 md:px-10">
        <p className="font-mono-caps text-[11px] text-muted-foreground">001 — Who We Are</p>
        <h1 className="mt-4 font-heading text-6xl font-medium leading-[0.95] tracking-[-0.03em] md:text-8xl">
          Art Future Club
        </h1>

        <div className="mt-16 space-y-12 text-lg leading-relaxed text-foreground/80">
          <div>
            <h2 className="font-heading text-2xl font-medium text-foreground mb-4">Our Mission</h2>
            <p>
              Art Future Club (AFC) is a global network and platform dedicated to emerging and established contemporary artists, collectors, curators, and cultural institutions. We exist to connect creative talent across cities, to amplify voices that deserve to be heard, and to build an infrastructure that sustains meaningful art careers.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-2xl font-medium text-foreground mb-4">The Network</h2>
            <p>
              With active chapters around the world, AFC operates as a decentralised cultural engine. Each chapter hosts monthly gatherings, open studio events, critique sessions, and collaborative exhibitions — rooted in the specific creative energy of its city while remaining part of a unified global conversation.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-2xl font-medium text-foreground mb-4">The Platform</h2>
            <p>
              Our digital platform extends the physical network into a living archive and marketplace. Artists maintain curated portfolios, collectors discover emerging talent, and the community engages through editorial features, forum discussions, and open call opportunities — all within a single ecosystem built for the art world.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-2xl font-medium text-foreground mb-4">Membership</h2>
            <p>
              AFC offers tiered membership plans that give artists and collectors deeper access to the network — from premium portfolio features and featured listings to gallery partnership opportunities. We believe in sustainable models that genuinely support creative practitioners.
            </p>
          </div>

          <div>
            <h2 className="font-heading text-2xl font-medium text-foreground mb-2">Our Team</h2>
            <p className="text-sm text-muted-foreground mb-8">The people building the club, city by city.</p>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              {/*
                Photos live in public/images/team/ — drop a file in with the
                matching name and it appears here. These replaced Unsplash
                stock URLs, which were showing six strangers as the team.
                A missing file falls back to the shared placeholder.
              */}
              {[
                { name: "Julie Petris", role: "Founder & Director", city: "Hong Kong / Los Angeles / Bangkok", img: "/images/team/julie-petris.jpg" },
                { name: "Michael Petris", role: "Founder & Director", city: "Hong Kong / Los Angeles / Bangkok", img: "/images/team/michael-petris.jpg" },
                { name: "Nicola O'Hara", role: "Editorial Editor", city: "London", img: "/images/team/nicola-ohara.jpg" },
                { name: "Benedetta Barzaghi", role: "Editorial Editor", city: "Milano", img: "/images/team/benedetta-barzaghi.jpg" },
                { name: "Christie Melville", role: "Editorial Editor", city: "Toronto", img: "/images/team/christie-melville.jpg" },
                { name: "Saskia Key", role: "Editorial Editor", city: "Zurich", img: "/images/team/saskia-key.jpg" },
              ].map((p) => (
                <div key={p.name} className="group">
                  <div className="aspect-[4/5] overflow-hidden bg-muted">
                    <img
                      src={p.img}
                      alt={p.name}
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = "/images/placeholder.png"; }}
                      className="h-full w-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-[1.03] transition-all duration-500"
                    />
                  </div>
                  <p className="mt-3 font-mono-caps text-[10px] text-primary">{p.role}</p>
                  <p className="font-heading text-xl tracking-[-0.01em]">{p.name}</p>
                  <p className="font-mono-caps text-[10px] text-muted-foreground">{p.city}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-heading text-2xl font-medium text-foreground mb-4">Contact</h2>
            <p>
              To get in touch, collaborate, or learn more about joining a chapter near you, reach us at{" "}
              <a href="mailto:hello@artfuture.club" className="text-primary hover:underline">
                hello@artfuture.club
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      <ManifestoFooter />
    </>
  );
}