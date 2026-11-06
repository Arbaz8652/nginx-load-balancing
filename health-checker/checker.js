const fs = require('fs/promises');
const path = require('path')

const NGINX_CONFIG_PATH = '/etc/nginx/generated/upstream.conf';

const INSTANCES = [
	{id: 'node1', url: 'http://node1:3000/health/ready'},
	{id: 'node2', url: 'http://node2:3000/health/ready'},
	{id: 'node3', url: 'http://node3:3000/health/ready'},
];

const CONFIG = {
	checkInterval: 5000,
	requestTimeout: 2000,
	failureThreshold: 3,
	recoveryThreshold: 2
}

const instanceStates = new Map();
let isShuttingDown = false;
let nextRunTimer = null;
let activeCycle = null;
let lastGeneratedConfig = '';

for (const instance of INSTANCES) {
	instanceStates.set(instance.id, {
		status: 'HEALTHY',
		consecutiveFailures: 0,
		consecutiveSuccesses: 0,
		lastCheckedAt: null
	});
}

console.log('Health check configuration loaded');
console.log('Monitoring instances: ', INSTANCES.map(i=> i.id));

async function checkInstance(instance){
	try{
		const response = await fetch(instance.url, {
			signal: AbortSignal.timeout(CONFIG.requestTimeout)
		}) 

		return response.ok;
	} catch (error) {
		// console.error(`[${instance.id}] Health check failed:`, error.message);
		return false;
	}
}
function getNowIST(){
	return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function updateHealthStatus(instanceId, isHealthy){
	const instance = instanceStates.get(instanceId)
	if (!instance) return;

	const prevStatus = instance.status;

	if (isHealthy) {
		instance.consecutiveSuccesses += 1;
		instance.consecutiveFailures = 0;
		if (instance.status === 'UNHEALTHY' && instance.consecutiveSuccesses >= CONFIG.recoveryThreshold) {
			instance.status = 'HEALTHY';
		}
	} else {
		instance.consecutiveFailures += 1;
		instance.consecutiveSuccesses = 0;
		if (instance.status === 'HEALTHY' && instance.consecutiveFailures >= CONFIG.failureThreshold) {
			instance.status = 'UNHEALTHY';
		}
	}
	instance.lastCheckedAt = getNowIST();

	if(prevStatus !== instance.status) {
		console.log(`[${instanceId}] Status changed from ${prevStatus} to ${instance.status}`);
	}
}

async function monitorInstances(instance) {
	const isHealthy = await checkInstance(instance);
	await updateHealthStatus(instance.id, isHealthy);

	const state = instanceStates.get(instance.id);	

	console.log(`[${instance.id}] Status: ${state.status} success: ${state.consecutiveSuccesses} failures: ${state.consecutiveFailures} checkedAt: ${state.lastCheckedAt}`)
}

async function monitorAllInstances() {
	await Promise.all(INSTANCES.map(instance => monitorInstances(instance)));
	console.log('All instances checked');
	await generateNginxUpstreamConfig();
	return;
}

async function runMonitoringCycle() {
	if (isShuttingDown) return;
	activeCycle = monitorAllInstances();

	try{
		await activeCycle;
	} catch(error){
		console.error('Monitoring cycle failed:', error.message);
	} finally {
		activeCycle = null;
		if(!isShuttingDown){
			nextRunTimer = setTimeout(runMonitoringCycle, CONFIG.checkInterval);
		}
	}
}

async function gracefulShutdown(signal){
	if (isShuttingDown) return;
	isShuttingDown = true;

	console.log(`Received shutdown signal ${signal}, shutting down gracefully...`);
	
	if(nextRunTimer) {
		clearTimeout(nextRunTimer);
		nextRunTimer = null;
	}

	if (activeCycle) {
		console.log('Waiting for active monitoring cycle to complete...');
		try {await activeCycle;} catch (error) {}
	}
	console.log('Health checker stopped gracefully.');

	process.exitCode = 0;
}


async function generateNginxUpstreamConfig(){
	const healthyInstances = INSTANCES.filter(instance => {
		const state = instanceStates.get(instance.id);
		return state && state.status === 'HEALTHY';
	});

	let config = '';

	if(!healthyInstances.length) {
		config = `
			upstream node_backend {
				server 127.0.0.1:1;
			}
		`;
	} else {
		const servers = healthyInstances
			.map(instance => `server ${instance.id}:3000;`)
			.join('\n');
			
		config = `
			upstream node_backend {
				${servers}
			}
				`;
	}

	if(config === lastGeneratedConfig) return;

	const tempPath = `${NGINX_CONFIG_PATH}.temp`;
	await fs.writeFile(tempPath, config);
	await fs.rename(tempPath, NGINX_CONFIG_PATH);
	lastGeneratedConfig = config;

	console.log(`NGINX upstream config updated: ${healthyInstances.map(instance => instance.id).join(', ')}`)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

console.log('Starting continuous health monitoring...');
runMonitoringCycle();
