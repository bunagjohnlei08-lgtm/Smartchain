export const ADMIN_ORDERS_PER_PAGE = 8;

export function adminOrderPage(total: number, requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_ORDERS_PER_PAGE));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  return {
    currentPage, totalPages, total,
    from: total ? (currentPage - 1) * ADMIN_ORDERS_PER_PAGE + 1 : 0,
    to: Math.min(currentPage * ADMIN_ORDERS_PER_PAGE, total),
  };
}

export function adminOrderPageButtons(currentPage: number, totalPages: number): Array<number | string> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages: Array<number | string> = [1];
  const start = Math.max(2, Math.min(currentPage - 1, totalPages - 4));
  const end = Math.min(totalPages - 1, Math.max(currentPage + 1, 5));
  if (start > 2) pages.push('start-ellipsis');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push('end-ellipsis');
  pages.push(totalPages);
  return pages;
}
