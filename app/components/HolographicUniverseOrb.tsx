export default function HolographicUniverseOrb() {
  return (
    <div className="cfsp-holo-orb" aria-hidden="true">
      <div className="cfsp-holo-orb__halo" />
      <div className="cfsp-holo-orb__sphere">
        <div className="cfsp-holo-orb__galaxy" />
        <div className="cfsp-holo-orb__stars" />
        <div className="cfsp-holo-orb__grid cfsp-holo-orb__grid--vertical" />
        <div className="cfsp-holo-orb__grid cfsp-holo-orb__grid--horizontal" />
        <div className="cfsp-holo-orb__flare" />
        <div className="cfsp-holo-orb__shine" />
      </div>
      <div className="cfsp-holo-orb__scan" />
    </div>
  );
}
