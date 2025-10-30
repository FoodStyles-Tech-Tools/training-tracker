"use client";

import { ChangeEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type SortOption = {
  value: string;
  label: string;
};

interface TableControlsProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: SortOption[];
  actions?: ReactNode;
  className?: string;
}

export function TableControls({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  sortValue,
  onSortChange,
  sortOptions,
  actions,
  className,
}: TableControlsProps) {
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(event.target.value);
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSortChange(event.target.value);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 md:max-w-3xl">
        <Input
          value={searchValue}
          onChange={handleQueryChange}
          placeholder={searchPlaceholder}
          className="w-full sm:flex-1"
          type="search"
        />
        {sortOptions.length ? (
          <Select
            value={sortValue}
            onChange={handleSortChange}
            className="w-full sm:w-56"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center justify-end gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

