const http = require('http');
const {Pool} = require('pg');

const PORT = 3000;

const INSTANCE_ID = process.env.INSTANCE_ID || 'unknown'

const pool = new Pool({
	connectionString: 'postgresql://postgres:password@postgres:5432/mydb',
	max: 10,
	connectionTimeoutMillis: 2000
})

async function checkPostgres(){
	return pool.query('SELECT 1');
}


function response(res, status, message, options= {}){
	res.writeHead(status, {'Content-Type': 'application/json'});

	return res.end(JSON.stringify({
		status: message,
		instanceID: INSTANCE_ID,
		dependencies: options
	}))
	
}

const server = http.createServer(async (req,res) => {
	console.log('Instance ID: ', INSTANCE_ID);

	const url = req.url;

	if(url==='/health/live'){
		return response(res, 200, 'alive'); 
	}

	if(url === '/health/ready'){

		try {
			await checkPostgres();
			return response(res, 200, 'ready', {postgres: 'healthy'})
		}catch(error){
			console.log('Postgres health check failed: ',error.message);
			return response(res, 503, 'not_ready', {postgres: 'unavailable'})			
		}
	}


	res.writeHead(200, {'Content-Type': 'application/json'})

	res.end(JSON.stringify({
		message: 'Hello from Nodejs',
		instance: INSTANCE_ID,
		timestamp: new Date().toISOString()
	}))
})

server.listen(PORT, "0.0.0.0", () => {
	console.log(`Instance ID: ${INSTANCE_ID} is running on ${PORT}`)
})


