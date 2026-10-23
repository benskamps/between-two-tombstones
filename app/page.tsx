import Link from "next/link";
import Image from "next/image";
import { Doors } from "@/components/haunt/Doors";
import { FamousCemeteries } from "@/components/haunt/Famous";
import { HauntReturn } from "@/components/haunt/HauntReturn";
import { HomeShowcase } from "@/components/home/HomeShowcase";

export default function Home() {
  return (
    <div className="home-editorial">
      <section className="cemetery-hero" aria-labelledby="home-title">
        <Image src="/images/cemetery-dusk.webp" alt="" fill priority sizes="100vw" className="cemetery-hero-image" />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="editorial-kicker">Macy’s graveyard companion</p>
          <h1 id="home-title">Between Two<br /><em>Tombstones</em><span className="hero-period">.</span></h1>
          <p className="hero-invitation">A little wander. A life you never knew.</p>
          <p className="hero-description">Meet the people behind the names. Follow their stories through a cemetery, wherever you are.</p>
          <div className="hero-actions">
            <Link href="/cemetery/Q360779" className="editorial-button">Step into Sleepy Hollow <span aria-hidden="true">↗</span></Link>
            <a href="#find" className="editorial-text-link">Find my own graveyard <span aria-hidden="true">↓</span></a>
          </div>
          <p className="hero-footnote">No account. No need to be there. Just curiosity.</p>
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
