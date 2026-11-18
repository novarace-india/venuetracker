import { BRAND } from '@gatecheck/shared/brand';
/** Always render the supplied complete NovaRace logo; Flow is a separate product label. */
export function Brand({ href, className = '' }: { href?: string; className?: string }) {
  const children = (
    <>
      <img
        className="brand-company-logo"
        src="/brand/novarace-white.png"
        alt="NovaRace"
        width="148"
        height="60"
      />
      <span className="brand-divider" aria-hidden="true" />
      <span className="brand-product">{BRAND.product}</span>
    </>
  );
  return href ? (
    <a href={href} className={`brand ${className}`} aria-label={`${BRAND.name} home`}>
      {children}
    </a>
  ) : (
    <div className={`brand ${className}`} role="img" aria-label={BRAND.name}>
      {children}
    </div>
  );
}
