import { MAX_QUERY, MIN_QUERY } from "@/lib/data/validate";

export function SearchForm({
  defaultValue = "",
  idPrefix = "search",
  placeholder = "Search a cemetery by name",
}: {
  defaultValue?: string;
  idPrefix?: string;
  placeholder?: string;
}) {
  const id = `${idPrefix}-q`;
  return (
    <form action="/search" className="flex gap-2" role="search">
      <label htmlFor={id} className="sr-only">
        Cemetery name
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
