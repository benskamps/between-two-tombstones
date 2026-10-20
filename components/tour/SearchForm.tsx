import { MAX_QUERY, MIN_QUERY } from "@/lib/data/validate";

export function SearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/search" className="flex gap-2" role="search">
      <label htmlFor="search-q" className="sr-only">
        Cemetery name
      </label>
      <input
        id="search-q"
        name="q"
        required
        minLength={MIN_QUERY}
        maxLength={MAX_QUERY}
        defaultValue={defaultValue}
        placeholder="Search a cemetery by name"
        className="tap min-w-0 flex-1 rounded-xl border border-border bg-surface px-4"
      />
      <button type="submit" className="tap rounded-xl border border-border px-4 font-bold">
        Search
      </button>
    </form>
  );
}
