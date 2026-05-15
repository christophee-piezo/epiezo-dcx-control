import { $ } from './runtime.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderScalarValue(value) {
  if (value == null) {
    return '<span class="log-scalar">null</span>';
  }

  return `<span class="log-scalar">${escapeHtml(String(value))}</span>`;
}

function renderStructuredValue(value) {
  if (value == null || typeof value !== 'object') {
    return renderScalarValue(value);
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return '<span class="log-scalar">[]</span>';
    }

    return `
      <table class="data-subtable">
        <tbody>
          ${value.map((entry, index) => `
            <tr>
              <th>${escapeHtml(String(index))}</th>
              <td>${renderStructuredValue(entry)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  const entries = Object.entries(value);
  if (!entries.length) {
    return '<span class="log-scalar">{}</span>';
  }

  return `
    <table class="data-subtable">
      <tbody>
        ${entries.map(([key, entryValue]) => `
          <tr>
            <th>${escapeHtml(key)}</th>
            <td>${renderStructuredValue(entryValue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function log(data) {
  const output = $('output');
  const outputBody = $('output-body');
  const timestamp = new Date().toLocaleTimeString();
  const message = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const renderedData = renderStructuredValue(data);

  if (!output || !outputBody) {
    console.log(`[${timestamp}] ${message}`);
    return;
  }

  outputBody.insertAdjacentHTML(
    'beforeend',
    `
      <tr>
        <td class="data-table-nowrap">${escapeHtml(timestamp)}</td>
        <td class="data-table-nested-cell">${renderedData}</td>
      </tr>
    `
  );

  output.scrollTop = output.scrollHeight;
}
