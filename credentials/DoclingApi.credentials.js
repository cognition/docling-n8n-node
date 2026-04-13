'use strict';

class DoclingApi {
	constructor() {
		this.name = 'doclingApi';
		this.displayName = 'Docling API';
		this.icon = {
			light: 'file:docling.svg',
			dark: 'file:docling.svg',
		};
		this.documentationUrl = 'https://github.com/docling-project/docling-serve';
		this.properties = [
			{
				displayName: 'Base URL',
				name: 'baseUrl',
				type: 'string',
				default: '={{ $env.DOCLING_API_URL }}',
				placeholder: 'http://docling-server:5001',
				description:
					'Docling Serve root URL only (no /v1 suffix — paths are appended automatically). No trailing slash. Use the Docker service name when n8n shares a network with temakwe/docling-server (e.g. docling-server:5001). Default: DOCLING_API_URL from the n8n environment.',
				required: true,
			},
			{
				displayName: 'API Key',
				name: 'apiKey',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				description:
					'Optional. When Docling Serve has DOCLING_SERVE_API_KEY set, send it as the X-Api-Key header.',
			},
		];
		this.test = {
			request: {
				baseURL: '={{$credentials.baseUrl}}',
				url: '/health',
				method: 'GET',
			},
			rules: [{ type: 'responseSuccess' }],
		};
	}
}

module.exports = { DoclingApi };
module.exports.DoclingApi = DoclingApi;
