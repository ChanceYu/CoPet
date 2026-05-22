import { ChevronUp, LocateFixed, PawPrint } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";

import type { PetSummary } from "../lib/appTypes";
import { PetPackageCard } from "./PetPackageCard";
import type { PetPackageCardProps } from "./PetPackageCard";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";

// Width breakpoints for the pet grid. Each card targets a ~150px min width;
// thresholds pad for the 10px gap between cards so we round up only when a
// new column would still leave each card readable.
export function computePetGridColumns(width: number): number {
  if (width >= 640) return 4;
  if (width >= 470) return 3;
  if (width >= 310) return 2;
  return 1;
}

export type PetPackageGridProps = {
  currentPetId?: string;
  emptyTitle: string;
  locateCurrentLabel?: string;
  pets: PetSummary[];
  renderSecondaryText?: (pet: PetSummary) => ReactNode;
  showCurrentLocator?: boolean;
  strings: PetPackageCardProps["strings"] & { backToTop: string };
  cardProps: (
    pet: PetSummary,
  ) => Omit<PetPackageCardProps, "pet" | "strings" | "secondaryText">;
};

export function PetPackageGrid({
  currentPetId,
  emptyTitle,
  locateCurrentLabel,
  pets,
  renderSecondaryText,
  showCurrentLocator = false,
  strings,
  cardProps,
}: PetPackageGridProps) {
  const [columns, setColumns] = useState(3);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const listRegionRef = useRef<HTMLDivElement | null>(null);
  const previousCurrentPetIdRef = useRef<string | undefined>(currentPetId);

  useLayoutEffect(() => {
    const node = listRegionRef.current;
    if (!node) {
      return;
    }

    const apply = (width: number) => {
      setColumns(computePetGridColumns(width));
    };

    apply(node.clientWidth);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        apply(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pets.length === 0]);

  const rows = useMemo(() => {
    const nextRows: PetSummary[][] = [];
    for (let i = 0; i < pets.length; i += columns) {
      nextRows.push(pets.slice(i, i + columns));
    }
    return nextRows;
  }, [columns, pets]);

  const gridStyle = useMemo(
    () =>
      ({
        "--pet-grid-columns": columns,
      }) as CSSProperties,
    [columns],
  );

  const scrollPetListToTop = () => {
    virtuosoRef.current?.scrollToIndex({ index: 0, behavior: "smooth" });
  };

  const scrollToCurrentPet = () => {
    const index = pets.findIndex((pet) => pet.id === currentPetId);
    if (index === -1) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({
      index: Math.floor(index / columns),
      align: "center",
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (!currentPetId || previousCurrentPetIdRef.current === currentPetId) {
      previousCurrentPetIdRef.current = currentPetId;
      return;
    }

    previousCurrentPetIdRef.current = currentPetId;
    scrollToCurrentPet();
  }, [columns, currentPetId, pets]);

  if (pets.length === 0) {
    return (
      <div className="pet-list-region" ref={listRegionRef}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <PawPrint aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="pet-list-region" ref={listRegionRef}>
      <Virtuoso
        className="pet-virtuoso"
        data={rows}
        itemContent={(_index, row) => (
          <div className="pet-grid" style={gridStyle}>
            {row.map((pet) => (
              <PetPackageCard
                key={pet.id}
                pet={pet}
                secondaryText={renderSecondaryText?.(pet)}
                strings={strings}
                {...cardProps(pet)}
              />
            ))}
          </div>
        )}
        ref={virtuosoRef}
      />
      <Button
        aria-label={strings.backToTop}
        className="pet-list-back-to-top"
        onClick={scrollPetListToTop}
        size="icon"
        title={strings.backToTop}
        type="button"
        variant="outline"
      >
        <ChevronUp aria-hidden="true" />
      </Button>
      {showCurrentLocator && locateCurrentLabel ? (
        <Button
          aria-label={locateCurrentLabel}
          className="pet-list-locate-current"
          onClick={scrollToCurrentPet}
          size="icon"
          title={locateCurrentLabel}
          type="button"
          variant="outline"
        >
          <LocateFixed aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
