'use strict';

const FormData = require('form-data');

const { NodeConnectionTypes, NodeOperationError } = require('n8n-workflow');

/**
 * Normalise base URL (no trailing slash).
 *
 * @param {string} url Raw base URL.
 * @returns {string} Trimmed URL without a trailing slash.
 */
function normaliseBaseUrl(url) {
	return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * Parse additional JSON options from a node parameter.
 *
 * @param {unknown} raw Value from additionalOptionsJson.
 * @returns {Record<string, unknown>} Parsed object or empty.
 */
function parseAdditionalOptions(raw) {
	if (raw === undefined || raw === null || raw === '') {
		return {};
	}
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		return /** @type {Record<string, unknown>} */ (raw);
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed === '' || trimmed === '{}') {
			return {};
		}
		try {
			const parsed = JSON.parse(trimmed);
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				throw new Error('Additional options must be a JSON object');
			}
			return /** @type {Record<string, unknown>} */ (parsed);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Invalid additional options JSON: ${message}`);
		}
	}
	throw new Error('Additional options must be a JSON object or string');
}

/**
 * Parse OCR language list from comma-separated or JSON array string.
 *
 * @param {string} raw User input.
 * @returns {string[]|undefined} Language codes or undefined if empty.
 */
function parseOcrLang(raw) {
	const s = String(raw || '').trim();
	if (!s) {
		return undefined;
	}
	if (s.startsWith('[')) {
		try {
			const parsed = JSON.parse(s);
			return Array.isArray(parsed) ? parsed.map(String) : undefined;
		} catch {
			return s.split(/[,;\s]+/).filter(Boolean);
		}
	}
	const parts = s.split(/[,;\s]+/).filter(Boolean);
	return parts.length ? parts : undefined;
}

/**
 * Build Docling Serve `options` object from n8n parameters (camelCase → snake_case).
 *
 * @param {import('n8n-workflow').IExecuteFunctions} ctx Execute context.
 * @param {number} itemIndex Current item index.
 * @returns {Record<string, unknown>} Options for the API.
 */
function buildConvertOptions(ctx, itemIndex) {
	/** @type {Record<string, unknown>} */
	const o = {};

	const fromFormats = ctx.getNodeParameter('fromFormats', itemIndex);
	if (Array.isArray(fromFormats) && fromFormats.length) {
		o.from_formats = fromFormats;
	}

	const toFormats = ctx.getNodeParameter('toFormats', itemIndex);
	if (Array.isArray(toFormats) && toFormats.length) {
		o.to_formats = toFormats;
	}

	const imageExportMode = ctx.getNodeParameter('imageExportMode', itemIndex);
	if (imageExportMode && String(imageExportMode) !== 'default') {
		o.image_export_mode = imageExportMode;
	}

	o.do_ocr = ctx.getNodeParameter('doOcr', itemIndex);
	o.force_ocr = ctx.getNodeParameter('forceOcr', itemIndex);

	const ocrEngine = ctx.getNodeParameter('ocrEngine', itemIndex);
	if (ocrEngine && String(ocrEngine) !== 'default') {
		o.ocr_engine = ocrEngine;
	}

	const ocrLangRaw = /** @type {string} */ (ctx.getNodeParameter('ocrLang', itemIndex));
	const ocrLang = parseOcrLang(ocrLangRaw);
	if (ocrLang && ocrLang.length) {
		o.ocr_lang = ocrLang;
	}

	const pdfBackend = ctx.getNodeParameter('pdfBackend', itemIndex);
	if (pdfBackend && String(pdfBackend) !== 'default') {
		o.pdf_backend = pdfBackend;
	}

	const tableMode = ctx.getNodeParameter('tableMode', itemIndex);
	if (tableMode && String(tableMode) !== 'default') {
		o.table_mode = tableMode;
	}

	o.do_table_structure = ctx.getNodeParameter('doTableStructure', itemIndex);
	o.table_cell_matching = ctx.getNodeParameter('tableCellMatching', itemIndex);

	const pipeline = /** @type {string} */ (ctx.getNodeParameter('pipeline', itemIndex));
	if (pipeline && pipeline.trim()) {
		o.pipeline = pipeline.trim();
	}

	const documentTimeout = ctx.getNodeParameter('documentTimeout', itemIndex);
	if (documentTimeout !== undefined && documentTimeout !== null && documentTimeout !== '') {
		const n = Number(documentTimeout);
		if (n > 0) {
			o.document_timeout = n;
		}
	}

	o.abort_on_error = ctx.getNodeParameter('abortOnError', itemIndex);
	o.include_images = ctx.getNodeParameter('includeImages', itemIndex);

	const imagesScale = ctx.getNodeParameter('imagesScale', itemIndex);
	if (imagesScale !== undefined && imagesScale !== null && imagesScale !== '') {
		o.images_scale = Number(imagesScale);
	}

	o.do_code_enrichment = ctx.getNodeParameter('doCodeEnrichment', itemIndex);
	o.do_formula_enrichment = ctx.getNodeParameter('doFormulaEnrichment', itemIndex);
	o.do_picture_classification = ctx.getNodeParameter('doPictureClassification', itemIndex);
	o.do_chart_extraction = ctx.getNodeParameter('doChartExtraction', itemIndex);
	o.do_picture_description = ctx.getNodeParameter('doPictureDescription', itemIndex);

	const vlmPreset = /** @type {string} */ (ctx.getNodeParameter('vlmPipelinePreset', itemIndex));
	if (vlmPreset && vlmPreset.trim()) {
		o.vlm_pipeline_preset = vlmPreset.trim();
	}

	const picPreset = /** @type {string} */ (ctx.getNodeParameter('pictureDescriptionPreset', itemIndex));
	if (picPreset && picPreset.trim()) {
		o.picture_description_preset = picPreset.trim();
	}

	const layoutPreset = /** @type {string} */ (ctx.getNodeParameter('layoutPreset', itemIndex));
	if (layoutPreset && layoutPreset.trim()) {
		o.layout_preset = layoutPreset.trim();
	}

	const tableStructurePreset = /** @type {string} */ (
		ctx.getNodeParameter('tableStructurePreset', itemIndex)
	);
	if (tableStructurePreset && tableStructurePreset.trim()) {
		o.table_structure_preset = tableStructurePreset.trim();
	}

	const extra = parseAdditionalOptions(ctx.getNodeParameter('additionalOptionsJson', itemIndex));
	return { ...o, ...extra };
}

/**
 * Append options to multipart form (docling-serve /v1/convert/file).
 *
 * @param {import('form-data').FormData} form FormData instance.
 * @param {Record<string, unknown>} options Options object.
 * @returns {void}
 */
function appendOptionsToForm(form, options) {
	for (const [key, value] of Object.entries(options)) {
		if (value === undefined || value === null) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				form.append(key, String(v));
			}
		} else if (typeof value === 'boolean' || typeof value === 'number') {
			form.append(key, String(value));
		} else if (typeof value === 'object') {
			form.append(key, JSON.stringify(value));
		} else {
			form.append(key, String(value));
		}
	}
}

class Docling {
	constructor() {
		this.description = {
			displayName: 'Docling',
			name: 'docling',
			icon: 'fa:file-text',
			group: ['transform'],
			version: 1,
			subtitle:
				'={{$parameter["resource"] === "utility" ? $parameter["utilityOperation"] : $parameter["operation"]}}',
			description:
				'Convert documents via Docling Serve (v1 REST API). Supports URL, base64, or multipart file upload.',
			defaults: {
				name: 'Docling',
			},
			inputs: [NodeConnectionTypes.Main],
			outputs: [NodeConnectionTypes.Main],
			usableAsTool: true,
			credentials: [
				{
					name: 'doclingApi',
					required: true,
				},
			],
			properties: [
				{
					displayName: 'Resource',
					name: 'resource',
					type: 'options',
					noDataExpression: true,
					options: [
						{ name: 'Convert', value: 'convert' },
						{ name: 'Utility', value: 'utility' },
					],
					default: 'convert',
				},
				{
					displayName: 'Operation',
					name: 'operation',
					type: 'options',
					noDataExpression: true,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'From URL', value: 'fromUrl', description: 'POST /v1/convert/source with http_sources' },
						{
							name: 'From Base64',
							value: 'fromBase64',
							description: 'POST /v1/convert/source with file_sources',
						},
						{
							name: 'From File',
							value: 'fromFile',
							description: 'POST /v1/convert/file (multipart)',
						},
					],
					default: 'fromUrl',
				},
				{
					displayName: 'Operation',
					name: 'utilityOperation',
					type: 'options',
					noDataExpression: true,
					displayOptions: {
						show: {
							resource: ['utility'],
						},
					},
					options: [
						{ name: 'Health', value: 'health', description: 'GET /health' },
						{ name: 'OpenAPI Spec', value: 'openApi', description: 'GET /openapi.json' },
					],
					default: 'health',
				},
				{
					displayName: 'Document URL',
					name: 'documentUrl',
					type: 'string',
					default: '',
					placeholder: 'https://arxiv.org/pdf/2206.01062',
					description: 'HTTP(S) URL of the document to fetch and convert.',
					displayOptions: {
						show: {
							resource: ['convert'],
							operation: ['fromUrl'],
						},
					},
				},
				{
					displayName: 'HTTP Source Headers (JSON)',
					name: 'httpSourceHeadersJson',
					type: 'json',
					default: '{}',
					displayOptions: {
						show: {
							resource: ['convert'],
							operation: ['fromUrl'],
						},
					},
					description: 'Optional JSON object of extra headers when fetching the URL (per http_sources item).',
				},
				{
					displayName: 'Base64 Data',
					name: 'base64String',
					type: 'string',
					typeOptions: {
						rows: 6,
					},
					default: '',
					displayOptions: {
						show: {
							resource: ['convert'],
							operation: ['fromBase64'],
						},
					},
					description: 'File content encoded as base64.',
				},
				{
					displayName: 'Filename',
					name: 'filename',
					type: 'string',
					default: 'document.pdf',
					displayOptions: {
						show: {
							resource: ['convert'],
							operation: ['fromBase64'],
						},
					},
					description: 'Original filename including extension (hints input format).',
				},
				{
					displayName: 'Binary Property',
					name: 'binaryPropertyName',
					type: 'string',
					default: 'data',
					displayOptions: {
						show: {
							resource: ['convert'],
							operation: ['fromFile'],
						},
					},
					description: 'Name of the binary field on each input item.',
				},
				{
					displayName: 'Filename Override',
					name: 'filenameOverride',
					type: 'string',
					default: '',
					placeholder: 'report.pdf',
					displayOptions: {
						show: {
							resource: ['convert'],
							operation: ['fromFile'],
						},
					},
					description:
						'Optional. Filename sent to Docling; if empty, uses binary data file name or "upload.bin".',
				},
				{
					displayName: 'Input Formats',
					name: 'fromFormats',
					type: 'multiOptions',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'DOCX', value: 'docx' },
						{ name: 'PPTX', value: 'pptx' },
						{ name: 'HTML', value: 'html' },
						{ name: 'Image', value: 'image' },
						{ name: 'PDF', value: 'pdf' },
						{ name: 'AsciiDoc', value: 'asciidoc' },
						{ name: 'Markdown', value: 'md' },
						{ name: 'CSV', value: 'csv' },
						{ name: 'XLSX', value: 'xlsx' },
						{ name: 'XML USPTO', value: 'xml_uspto' },
						{ name: 'XML JATS', value: 'xml_jats' },
						{ name: 'XML XBRL', value: 'xml_xbrl' },
						{ name: 'METS GBS', value: 'mets_gbs' },
						{ name: 'JSON Docling', value: 'json_docling' },
						{ name: 'Audio', value: 'audio' },
						{ name: 'WebVTT', value: 'vtt' },
						{ name: 'LaTeX', value: 'latex' },
					],
					default: [],
					description: 'Leave empty to allow all input formats (server default).',
				},
				{
					displayName: 'Output Formats',
					name: 'toFormats',
					type: 'multiOptions',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'Markdown', value: 'md' },
						{ name: 'JSON', value: 'json' },
						{ name: 'YAML', value: 'yaml' },
						{ name: 'HTML', value: 'html' },
						{ name: 'HTML Split Page', value: 'html_split_page' },
						{ name: 'Plain Text', value: 'text' },
						{ name: 'DocTags', value: 'doctags' },
						{ name: 'WebVTT', value: 'vtt' },
					],
					default: [],
					description: 'Leave empty for server default (typically Markdown).',
				},
				{
					displayName: 'Image Export Mode',
					name: 'imageExportMode',
					type: 'options',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'Server Default', value: 'default' },
						{ name: 'Placeholder', value: 'placeholder' },
						{ name: 'Embedded', value: 'embedded' },
						{ name: 'Referenced', value: 'referenced' },
					],
					default: 'default',
				},
				{
					displayName: 'Do OCR',
					name: 'doOcr',
					type: 'boolean',
					default: true,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Force OCR',
					name: 'forceOcr',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'OCR Engine',
					name: 'ocrEngine',
					type: 'options',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'Server Default', value: 'default' },
						{ name: 'Auto', value: 'auto' },
						{ name: 'EasyOCR', value: 'easyocr' },
						{ name: 'KServe V2 OCR', value: 'kserve_v2_ocr' },
						{ name: 'OCR Mac', value: 'ocrmac' },
						{ name: 'RapidOCR', value: 'rapidocr' },
						{ name: 'Tesserocr', value: 'tesserocr' },
						{ name: 'Tesseract', value: 'tesseract' },
					],
					default: 'default',
				},
				{
					displayName: 'OCR Languages',
					name: 'ocrLang',
					type: 'string',
					default: '',
					placeholder: 'en, fr',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					description: 'Comma-separated language codes, or a JSON array string.',
				},
				{
					displayName: 'PDF Backend',
					name: 'pdfBackend',
					type: 'options',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'Server Default', value: 'default' },
						{ name: 'pypdfium2', value: 'pypdfium2' },
						{ name: 'docling_parse', value: 'docling_parse' },
						{ name: 'dlparse_v1', value: 'dlparse_v1' },
						{ name: 'dlparse_v2', value: 'dlparse_v2' },
						{ name: 'dlparse_v4', value: 'dlparse_v4' },
					],
					default: 'default',
				},
				{
					displayName: 'Table Mode',
					name: 'tableMode',
					type: 'options',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					options: [
						{ name: 'Server Default', value: 'default' },
						{ name: 'Fast', value: 'fast' },
						{ name: 'Accurate', value: 'accurate' },
					],
					default: 'default',
				},
				{
					displayName: 'Do Table Structure',
					name: 'doTableStructure',
					type: 'boolean',
					default: true,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Table Cell Matching',
					name: 'tableCellMatching',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Pipeline',
					name: 'pipeline',
					type: 'string',
					default: '',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					description: 'Optional processing pipeline identifier (see Docling Serve docs).',
				},
				{
					displayName: 'Document Timeout (seconds)',
					name: 'documentTimeout',
					type: 'number',
					typeOptions: {
						minValue: 0,
					},
					default: 0,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					description: '0 = omit (use server default).',
				},
				{
					displayName: 'Abort on Error',
					name: 'abortOnError',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Include Images',
					name: 'includeImages',
					type: 'boolean',
					default: true,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Images Scale',
					name: 'imagesScale',
					type: 'number',
					typeOptions: {
						minValue: 0,
					},
					default: 2,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Code Enrichment',
					name: 'doCodeEnrichment',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Formula Enrichment',
					name: 'doFormulaEnrichment',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Picture Classification',
					name: 'doPictureClassification',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Chart Extraction',
					name: 'doChartExtraction',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Picture Description',
					name: 'doPictureDescription',
					type: 'boolean',
					default: false,
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'VLM Pipeline Preset',
					name: 'vlmPipelinePreset',
					type: 'string',
					default: '',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Picture Description Preset',
					name: 'pictureDescriptionPreset',
					type: 'string',
					default: '',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Layout Preset',
					name: 'layoutPreset',
					type: 'string',
					default: '',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Table Structure Preset',
					name: 'tableStructurePreset',
					type: 'string',
					default: '',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
				},
				{
					displayName: 'Additional Options (JSON)',
					name: 'additionalOptionsJson',
					type: 'json',
					default: '{}',
					displayOptions: {
						show: {
							resource: ['convert'],
						},
					},
					description:
						'Merged into the request `options` object last (override). Use for advanced Docling Serve fields.',
				},
				{
					displayName: 'Request Timeout (ms)',
					name: 'requestTimeoutMs',
					type: 'number',
					typeOptions: {
						minValue: 1000,
					},
					default: 300000,
					description: 'HTTP client timeout for conversion (large documents may need more time).',
				},
			],
		};
	}

	/**
	 * Resolve API base URL and auth headers from credentials.
	 *
	 * @returns {Promise<{ baseUrl: string; headers: Record<string, string> }>}
	 */
	async resolveRequestConfig() {
		const cred = await this.getCredentials('doclingApi');
		const baseUrl = normaliseBaseUrl(/** @type {string} */ (cred.baseUrl));
		/** @type {Record<string, string>} */
		const headers = {};
		const apiKey = cred.apiKey;
		if (apiKey !== undefined && apiKey !== null && String(apiKey).trim() !== '') {
			headers['X-Api-Key'] = String(apiKey);
		}
		return { baseUrl, headers };
	}

	/**
	 * Execute Docling node.
	 *
	 * @returns {Promise<import('n8n-workflow').INodeExecutionData[][]>}
	 */
	async execute() {
		const items = this.getInputData();
		const resource = /** @type {string} */ (this.getNodeParameter('resource', 0));
		const timeout = Number(this.getNodeParameter('requestTimeoutMs', 0)) || 300000;

		if (resource === 'utility') {
			const { baseUrl, headers } = await this.resolveRequestConfig();
			const utilityOperation = /** @type {string} */ (this.getNodeParameter('utilityOperation', 0));
			const path = utilityOperation === 'openApi' ? '/openapi.json' : '/health';
			try {
				const res = await this.helpers.httpRequest({
					method: 'GET',
					url: `${baseUrl}${path}`,
					headers,
					json: true,
					timeout,
				});
				return [[{ json: /** @type {import('n8n-workflow').IDataObject} */ (res) }]];
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: 0 });
			}
		}

		const operation = /** @type {string} */ (this.getNodeParameter('operation', 0));

		if (operation === 'fromUrl') {
			return this.executeFromUrl(items, timeout);
		}
		if (operation === 'fromBase64') {
			return this.executeFromBase64(items, timeout);
		}
		if (operation === 'fromFile') {
			return this.executeFromFile(items, timeout);
		}

		throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: 0 });
	}

	/**
	 * Convert from remote URL (sync JSON API).
	 *
	 * @param {import('n8n-workflow').INodeExecutionData[]} items Input items.
	 * @param {number} timeout Request timeout ms.
	 * @returns {Promise<import('n8n-workflow').INodeExecutionData[][]>}
	 */
	async executeFromUrl(items, timeout) {
		const { baseUrl, headers } = await this.resolveRequestConfig();
		headers['Content-Type'] = 'application/json';
		/** @type {import('n8n-workflow').INodeExecutionData[]} */
		const out = [];

		for (let i = 0; i < items.length; i += 1) {
			const documentUrl = String(this.getNodeParameter('documentUrl', i) || '').trim();
			if (!documentUrl) {
				throw new NodeOperationError(this.getNode(), 'Document URL is required', { itemIndex: i });
			}

			let headerObj = {};
			try {
				headerObj = parseAdditionalOptions(this.getNodeParameter('httpSourceHeadersJson', i));
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}

			/** @type {Record<string, unknown>} */
			const httpItem = { url: documentUrl };
			if (headerObj && typeof headerObj === 'object' && Object.keys(headerObj).length > 0) {
				httpItem.headers = headerObj;
			}

			let options;
			try {
				options = buildConvertOptions(this, i);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}

			const body = {
				http_sources: [httpItem],
				options,
			};

			try {
				const res = await this.helpers.httpRequest({
					method: 'POST',
					url: `${baseUrl}/v1/convert/source`,
					headers,
					body,
					json: true,
					timeout,
				});
				const row = {
					json: /** @type {import('n8n-workflow').IDataObject} */ (res),
				};
				if (items[i].pairedItem !== undefined) {
					row.pairedItem = items[i].pairedItem;
				}
				out.push(row);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}
		}

		return [out];
	}

	/**
	 * Convert from base64-encoded file content.
	 *
	 * @param {import('n8n-workflow').INodeExecutionData[]} items Input items.
	 * @param {number} timeout Request timeout ms.
	 * @returns {Promise<import('n8n-workflow').INodeExecutionData[][]>}
	 */
	async executeFromBase64(items, timeout) {
		const { baseUrl, headers } = await this.resolveRequestConfig();
		headers['Content-Type'] = 'application/json';
		/** @type {import('n8n-workflow').INodeExecutionData[]} */
		const out = [];

		for (let i = 0; i < items.length; i += 1) {
			const base64String = String(this.getNodeParameter('base64String', i) || '').trim();
			const filename = String(this.getNodeParameter('filename', i) || 'document.pdf').trim() || 'document.pdf';
			if (!base64String) {
				throw new NodeOperationError(this.getNode(), 'Base64 Data is required', { itemIndex: i });
			}

			let options;
			try {
				options = buildConvertOptions(this, i);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}

			const body = {
				file_sources: [{ base64_string: base64String, filename }],
				options,
			};

			try {
				const res = await this.helpers.httpRequest({
					method: 'POST',
					url: `${baseUrl}/v1/convert/source`,
					headers,
					body,
					json: true,
					timeout,
				});
				const row = {
					json: /** @type {import('n8n-workflow').IDataObject} */ (res),
				};
				if (items[i].pairedItem !== undefined) {
					row.pairedItem = items[i].pairedItem;
				}
				out.push(row);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}
		}

		return [out];
	}

	/**
	 * Convert from binary file (multipart).
	 *
	 * @param {import('n8n-workflow').INodeExecutionData[]} items Input items.
	 * @param {number} timeout Request timeout ms.
	 * @returns {Promise<import('n8n-workflow').INodeExecutionData[][]>}
	 */
	async executeFromFile(items, timeout) {
		const { baseUrl, headers } = await this.resolveRequestConfig();
		delete headers['Content-Type'];
		/** @type {import('n8n-workflow').INodeExecutionData[]} */
		const out = [];

		for (let i = 0; i < items.length; i += 1) {
			const prop = /** @type {string} */ (this.getNodeParameter('binaryPropertyName', i));
			const item = items[i];
			if (!item.binary || !item.binary[prop]) {
				throw new NodeOperationError(
					this.getNode(),
					`No binary data in property "${prop}"`,
					{ itemIndex: i },
				);
			}

			const bin = item.binary[prop];
			const buffer = await this.helpers.getBinaryDataBuffer(i, prop);
			const override = String(this.getNodeParameter('filenameOverride', i) || '').trim();
			const fileName =
				override ||
				(bin.fileName && String(bin.fileName)) ||
				(bin.fileExtension ? `upload.${bin.fileExtension}` : 'upload.bin');
			const mimeType = (bin.mimeType && String(bin.mimeType)) || 'application/octet-stream';

			let options;
			try {
				options = buildConvertOptions(this, i);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}

			const form = new FormData();
			appendOptionsToForm(form, options);
			form.append('files', buffer, { filename: fileName, contentType: mimeType });

			const formHeaders = form.getHeaders();
			try {
				const res = await this.helpers.httpRequest({
					method: 'POST',
					url: `${baseUrl}/v1/convert/file`,
					headers: {
						...headers,
						...formHeaders,
					},
					body: form,
					json: true,
					timeout,
				});
				const row = {
					json: /** @type {import('n8n-workflow').IDataObject} */ (res),
				};
				if (item.pairedItem !== undefined) {
					row.pairedItem = item.pairedItem;
				}
				out.push(row);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new NodeOperationError(this.getNode(), message, { itemIndex: i });
			}
		}

		return [out];
	}
}

module.exports = Docling;
module.exports.Docling = Docling;
