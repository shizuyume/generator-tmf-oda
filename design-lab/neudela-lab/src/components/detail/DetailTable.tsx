import { useState } from 'react';
import type { CSSProperties } from 'react';
import { NeuronTable } from 'neudela';
import type { NeuronTableColumn } from 'neudela';
import ListTablePagination from '../list-table/ListTablePagination';
import '../list-table/ListTable.css';
import './Detail.css';

interface Props<T> {
  columns: NeuronTableColumn<T>[];
  /** Already filtered rows (client-side). Remount (key) to reset paging on a new search. */
  rows: T[];
  emptyText: string;
  /** Below this the table scrolls horizontally. Default 560. */
  minWidth?: number;
  /** Paging appears once rows exceed the page size. */
  pageSize?: number;
}

// Table of an embedded list (policies, variables) inside a DetailCard: the list-table skin,
// a leading "No" column, and the shared footer once it outgrows one page.
export default function DetailTable<T extends Record<string, any>>({
  columns,
  rows,
  emptyText,
  minWidth = 560,
  pageSize: initialSize = 10,
}: Readonly<Props<T>>) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);

  if (rows.length === 0) return <p className="dt-empty">{emptyText}</p>;

  const paged = rows.length > size;
  const offset = paged ? page * size : 0;
  const visible = paged ? rows.slice(offset, offset + size) : rows;
  const tableColumns: NeuronTableColumn<T>[] = [
    {
      key: '__no',
      label: 'No',
      width: 56,
      render: (_v, _r: T, index: number) => <span className="lt-cell-no">{offset + index + 1}.</span>,
    },
    ...columns,
  ];

  return (
    <>
      <div className="lt-table dt-table" style={{ '--lt-min-width': `${minWidth}px` } as CSSProperties}>
        <NeuronTable<T> columns={tableColumns} data={visible} rowKey={(_r, i) => offset + i} />
      </div>
      {rows.length > initialSize && (
        <ListTablePagination
          page={page}
          pageSize={size}
          pageSizeOptions={[5, 10, 25, 50]}
          total={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setSize(s); setPage(0); }}
        />
      )}
    </>
  );
}
