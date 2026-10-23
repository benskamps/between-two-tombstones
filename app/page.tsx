import Link from "next/link";
import Image from "next/image";
import { Doors } from "@/components/haunt/Doors";
import { FamousCemeteries } from "@/components/haunt/Famous";
import { HauntReturn } from "@/components/haunt/HauntReturn";
import { HomeShowcase } from "@/components/home/HomeShowcase";
import { deckHref, SAMPLE_PLACES } from "@/lib/gravitator/places";

export default function Home() {
  return (
    <div className="home-editorial">
      <section className="cemetery-hero" aria-labelledby="home-title">
        <Image src="/images/cemetery-dusk.webp" alt="" fill priority sizes="100vw" className="cemetery-hero-image" />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="editorial-kicker">Meet the dead next door</p>
          <h1 id="home-title">Swipe right on a graveyard<span className="hero-period">.</span></h1>
          <p className="hero-description">Find the old cemeteries near you, meet the people buried there, then go haunt them. It’s Halloween. They’ve been waiting.</p>
          <div className="hero-actions">
            <Link href="/gravitator" className="editorial-button">Start swiping <span aria-hidden="true">↗</span></Link>
            <Link href="/cemetery/Q360779" className="editorial-text-link">Step into Sleepy Hollow <span aria-hidden="true">↗</span></Link>
          </div>
          <p className="hero-cities">
            <span>Not near one? Swipe</span>
            {SAMPLE_PLACES.filter((p) => !p.label.startsWith("Sleepy")).map((p) => (
              <Link key={p.label} href={deckHref(p.lat, p.lon, { near: p.label })} className="tap">
                {p.label.split(",")[0]}
              </Link>
            ))}
          </p>
          <p className="hero-footnote">No account. Your location is asked for only when you tap.</p>
        </div>
        <div className="hero-bottom"><span>For the living. About the lives before us.</span><a href="#discover" className="tap">Wander a little <span aria-hidden="true">↓</span></a></div>
      </section>

      <div className="editorial-body">
        <div className="home-return"><HauntReturn when="fresh" /></div>
        <section id="discover" className="home-destinations">
          <div className="section-intro"><p className="editorial-kicker">01 / Choose a place</p><p>You don’t have to be at the gate to go exploring.</p></div>
          <FamousCemeteries />
        </section>
        <section id="find" className="home-finder" aria-label="Find your graveyard">
          <div className="section-intro"><p className="editorial-kicker">02 / Take it outside</p><p>At the gates already? Start here.</p></div>
          <Doors />
          <div className="mt-6"><HauntReturn when="stale" /></div>
        </section>
        <section id="field-guide" className="home-stories" aria-label="Stories and field tools">
          <div className="section-intro"><p className="editorial-kicker">03 / Look a little closer</p><p>There’s more here than names and dates.</p></div>
          <HomeShowcase />
        </section>
        <p className="artwork-credit">Cemetery atmosphere: generated artwork. Stories and tour records: Wikipedia &amp; Wikidata.</p>
      </div>
    </div>
  );
}
