// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecordList from '../components/RecordList';
import type { DecryptedRecord } from '../types';

const sampleRecords: DecryptedRecord[] = [
  {
    id: 1,
    productName: 'MacBook Pro',
    price: 1234.56,
    seller: 'Apple Store',
    salesPerson: 'Alice',
    time: '2024-01-15T10:30:00.000Z',
    createdAt: '2024-01-15T10:30:00',
  },
  {
    id: 2,
    productName: 'Keyboard',
    price: 89.99,
    seller: 'Amazon',
    salesPerson: 'Bob',
    time: '2024-01-16T14:00:00.000Z',
    createdAt: '2024-01-16T14:00:00',
  },
];

describe('RecordList', () => {
  it('1. loading=true shows spinner, not the records table', () => {
    render(<RecordList records={[]} loading={true} onDelete={vi.fn()} />);
    expect(screen.getByText(/decrypting records/i)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('2. empty records shows "No records yet" message', () => {
    render(<RecordList records={[]} loading={false} onDelete={vi.fn()} />);
    expect(screen.getByText(/no records yet/i)).toBeTruthy();
  });

  it('3. records render with correctly formatted price ($1,234.56)', () => {
    render(<RecordList records={sampleRecords} loading={false} onDelete={vi.fn()} />);
    // Price should be formatted with 2 decimal places and thousands separator
    expect(screen.getByText('$1,234.56')).toBeTruthy();
    expect(screen.getByText('$89.99')).toBeTruthy();
  });

  it('4. delete button calls onDelete with the correct record id', () => {
    const onDelete = vi.fn();
    const { container } = render(<RecordList records={sampleRecords} loading={false} onDelete={onDelete} />);

    // Delete buttons are hidden by CSS hover — find by title attribute
    const deleteButtons = container.querySelectorAll('button[title="Delete record"]');
    expect(deleteButtons.length).toBe(2);

    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith(1);

    fireEvent.click(deleteButtons[1]);
    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it('5. record count badge shows the correct number', () => {
    render(<RecordList records={sampleRecords} loading={false} onDelete={vi.fn()} />);
    expect(screen.getByText('2 records')).toBeTruthy();
  });

  it('6. product names, sellers, and sales people are rendered', () => {
    render(<RecordList records={sampleRecords} loading={false} onDelete={vi.fn()} />);
    expect(screen.getByText('MacBook Pro')).toBeTruthy();
    expect(screen.getByText('Apple Store')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });
});
