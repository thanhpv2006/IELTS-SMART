/**
 * Component tests for SearchBar, Pagination, and usePaginatedSearch.
 * Covers CMP-04.
 *
 * Cases:
 *   CMP-04a — SearchBar renders an input and calls onChange on type.
 *   CMP-04b — Pagination hides when totalPages <= 1.
 *   CMP-04c — Pagination renders prev/next buttons + page indicator.
 *   CMP-04d — Prev button disabled on page 1; next button disabled on last page.
 *   CMP-04e — usePaginatedSearch: changing query resets page to 1.
 *   CMP-04f — usePaginatedSearch: boundary — last page shows remaining items.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import {
  SearchBar,
  Pagination,
  usePaginatedSearch,
} from "@/components/ui/search-pagination";

describe("CMP-04a — SearchBar renders and fires onChange", () => {
  it("renders a text input with default placeholder", () => {
    render(<SearchBar value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Tìm kiếm...")).toBeInTheDocument();
  });

  it("renders a custom placeholder", () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Nhập tên..." />);
    expect(screen.getByPlaceholderText("Nhập tên...")).toBeInTheDocument();
  });

  it("calls onChange each time a character is typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // SearchBar is a controlled component: the parent owns `value`.
    // Each keystroke fires onChange(e.target.value) with whatever the input
    // currently contains. Because value="" never changes in this render, each
    // call receives only the single new character the browser appends to "".
    render(<SearchBar value="" onChange={onChange} />);
    await user.type(screen.getByRole("textbox"), "abc");
    // Three characters typed → onChange called 3 times.
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("CMP-04b — Pagination hidden when totalPages <= 1", () => {
  it("returns null when totalPages = 0", () => {
    const { container } = render(
      <Pagination page={1} totalPages={0} onChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when totalPages = 1", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ─── CMP-04c: Pagination renders with multiple pages ─────────────────────────

describe("CMP-04c — Pagination renders page indicator", () => {
  it("shows 'Trang X / Y' indicator", () => {
    render(<Pagination page={2} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByTestId("page-indicator")).toHaveTextContent("Trang 2 / 5");
  });

  it("renders prev (‹) and next (›) buttons", () => {
    render(<Pagination page={3} totalPages={5} onChange={vi.fn()} />);
    expect(screen.getByTestId("page-prev")).toBeInTheDocument();
    expect(screen.getByTestId("page-next")).toBeInTheDocument();
  });
});

// ─── CMP-04d: Boundary button states ─────────────────────────────────────────

describe("CMP-04d — Prev/next buttons disabled at boundaries", () => {
  it("prev button is disabled on page 1", () => {
    render(<Pagination page={1} totalPages={3} onChange={vi.fn()} />);
    expect(screen.getByTestId("page-prev")).toBeDisabled();
  });

  it("next button is disabled on the last page", () => {
    render(<Pagination page={3} totalPages={3} onChange={vi.fn()} />);
    expect(screen.getByTestId("page-next")).toBeDisabled();
  });

  it("prev button is enabled when not on page 1", () => {
    render(<Pagination page={2} totalPages={3} onChange={vi.fn()} />);
    expect(screen.getByTestId("page-prev")).not.toBeDisabled();
  });

  it("next button is enabled when not on last page", () => {
    render(<Pagination page={2} totalPages={3} onChange={vi.fn()} />);
    expect(screen.getByTestId("page-next")).not.toBeDisabled();
  });

  it("clicking next calls onChange with page+1", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByTestId("page-next"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("clicking prev calls onChange with page-1", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);
    await user.click(screen.getByTestId("page-prev"));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

// ─── CMP-04e: usePaginatedSearch resets page when query changes ───────────────

// Thin wrapper that renders the hook results for testing.
function SearchHarness({
  items,
  pageSize = 5,
}: {
  items: string[];
  pageSize?: number;
}) {
  const { query, setQuery, page, setPage, paged, totalPages } =
    usePaginatedSearch(items, (item, q) => item.includes(q), pageSize);

  return (
    <div>
      <input
        data-testid="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button data-testid="go-page-3" onClick={() => setPage(3)}>
        Go 3
      </button>
      <span data-testid="current-page">{page}</span>
      <span data-testid="total-pages">{totalPages}</span>
      <ul>
        {paged.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

describe("CMP-04e — usePaginatedSearch resets page when query changes", () => {
  it("resets page to 1 when query is updated", async () => {
    const user = userEvent.setup();
    // 15 items; pageSize 5 → 3 pages
    const items = Array.from({ length: 15 }, (_, i) => `item-${i}`);
    render(<SearchHarness items={items} pageSize={5} />);

    // Navigate to page 3 first
    await user.click(screen.getByTestId("go-page-3"));
    expect(screen.getByTestId("current-page")).toHaveTextContent("3");

    // Type in search — page should reset to 1
    await user.type(screen.getByTestId("search-input"), "x");
    expect(screen.getByTestId("current-page")).toHaveTextContent("1");
  });
});

// ─── CMP-04f: usePaginatedSearch boundary — last page ────────────────────────

describe("CMP-04f — usePaginatedSearch last page shows remaining items", () => {
  it("last page has the correct number of items (11 items, pageSize 5 → page 3 has 1)", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 11 }, (_, i) => `item-${i}`);

    // Drive the hook by navigating directly.
    function HarnessPage3() {
      const { paged, page, setPage } = usePaginatedSearch(
        items,
        (item, q) => item.includes(q),
        5
      );
      return (
        <div>
          <button onClick={() => setPage(3)}>Go 3</button>
          <span data-testid="page">{page}</span>
          <span data-testid="count">{paged.length}</span>
        </div>
      );
    }

    render(<HarnessPage3 />);
    // Use userEvent so React state flush happens inside act().
    await user.click(screen.getByRole("button", { name: "Go 3" }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
