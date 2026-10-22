import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorPage from "./error";
import GlobalError from "./global-error";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&rsquo;|’/g, "'").replace(/\s+/g, " ");

describe("error pages (red team P2-15)", () => {
  it("say what happened and offer try again, home and saved tours", () => {
    const html = renderToStaticMarkup(createElement(ErrorPage, { error: new Error("boom"), retry: () => {} }));
    expect(text(html)).toContain("This page didn't load");
    expect(text(html)).toContain("Something went wrong on our side while putting this page together.");
    expect(text(html)).toContain("Try loading it again. If it still fails, start over from home, or open a tour you saved on this phone");
    expect(html).toMatch(/<button[^>]*class="btn btn-primary"[^>]*>Try again<\/button>/);
    expect(html).toContain('<a class="btn btn-ghost" href="/">Go home</a>');
    expect(html).toContain('<a class="btn btn-ghost" href="/cemetery/saved">Open saved tours</a>');
    expect(html).toContain('role="alert"');
    expect(html).toContain("data-btt-nocache");
    // Never the error's own message (in production a server error's message is hidden anyway).
    expect(html).not.toContain("boom");
  });

  it("show the digest that matches the server log, when there is one", () => {
    const err = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2481632" });
    expect(text(renderToStaticMarkup(createElement(ErrorPage, { error: err, retry: () => {} })))).toContain("If you report this, mention error 2481632.");
    expect(renderToStaticMarkup(createElement(ErrorPage, { error: "thrown string", retry: () => {} }))).not.toContain("mention error");
  });

  it("global-error brings its own dark document around the same page", () => {
    const html = renderToStaticMarkup(createElement(GlobalError, { error: new Error("layout"), retry: () => {} }));
    expect(html).toMatch(/^<html lang="en"[^>]*color-scheme:dark/);
    expect(html).toContain("<body");
    expect(html).toContain("--font-body:system-ui, sans-serif");
    expect(text(html)).toContain("This page didn't load");
    expect(html).toContain('href="/cemetery/saved"');
  });
});
