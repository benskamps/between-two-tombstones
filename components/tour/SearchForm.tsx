import { MAX_QUERY, MIN_QUERY } from "@/lib/data/validate";

export function SearchForm({
  defaultValue = "",
  idPrefix = "search",
  placeholder = "Search a cemetery by name",
  label,
}: {
  defaultValue?: string;
  idPrefix?: string;
  placeholder?: string;
  /** A visible label (Atkinson, bone). Without one, the field is labelled "Cemetery name" for screen readers only. */
  label?: string;
}) {
  const id = `${idPrefix}-q`;
  return (
    <form action="/search" className={label ? "flex flex-wrap gap-2" : "flex gap-2"} role="search">
      <label htmlFor={id} className={label ? "w-full text-base font-bold text-text" : "sr-only"}>
        {label ?? "Cemetery name"}
      </label>
      <input
        id={id}
        name="q"
        required
        minLength={MIN_QUERY}
        maxLength={MAX_QUERY}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field flex-1"
      />
      <button type="submit" className="btn btn-ghost">
        Search
      </button>
    </form>
  );
}
