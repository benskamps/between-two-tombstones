/**
 * On a hub that isn't the haunt: name the haunt and offer the switch (REVIEW-2 N6),
 * under the hub's header. The sentence keeps at least 16rem; when the pill doesn't
 * fit beside that, it wraps under the sentence (review 4, #4: beside it on a phone,
 * "Your haunt is Oakland Cemetery." broke over three lines). The pill stays 48 px tall.
 */
export function MakeHauntOffer({ name, onMake }: { name: string; onMake: () => void }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2" data-testid="make-haunt">
      <p className="min-w-0 grow basis-64">
        Your haunt is <span className="font-bold">{name}</span>.
      </p>
      <button type="button" onClick={onMake} className="btn btn-primary">
        Make this my haunt
      </button>
    </div>
  );
}
