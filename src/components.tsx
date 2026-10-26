import { type CSSProperties } from "react";
import {
  Globe2,
  Heart,
  LockKeyhole,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import type { Domain } from "../shared/types";
export const number = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
export const colors: Record<string, string> = {
  COMMON: "#8d98ae",
  UNCOMMON: "#65c89c",
  RARE: "#5797ff",
  EPIC: "#ac8cff",
  LEGENDARY: "#efbd64",
  MYTHIC: "#ff7f9d",
};
export function DomainCard({
  domain,
  compact = false,
  onClick,
}: {
  domain: Omit<Partial<Domain>, "rarity"> & {
    name: string;
    tld: string;
    rarity: string;
  };
  compact?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="card-top">
        <Globe2 size={compact ? 16 : 20} />
        <span>{domain.rarity}</span>
        {domain.vaulted ? (
          <LockKeyhole size={15} />
        ) : domain.favorite ? (
          <Heart size={15} />
        ) : null}
      </div>
      <strong className="domain-name">
        {domain.name}
        <span>.{domain.tld}</span>
      </strong>
      <div className="card-bottom">
        <span>
          {domain.value !== undefined
            ? number(domain.value) + " ◈"
            : "VIRTUAL DOMAIN"}
        </span>
        {onClick && <ArrowUpRight size={16} />}
      </div>
    </>
  );
  return onClick ? (
    <button
      className={"domain-card " + (compact ? "compact" : "")}
      style={{ "--rarity": colors[domain.rarity] } as CSSProperties}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div
      className={"domain-card " + (compact ? "compact" : "")}
      style={{ "--rarity": colors[domain.rarity] } as CSSProperties}
    >
      {content}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Sparkles />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
