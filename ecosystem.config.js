module.exports = {
	apps: [
		{
			name: "Agent Discord Bot",
			script: "bun",
			args: "run start",
			interpreter: "none",
			autorestart: true,
			watch: ["src"],
			ignore_watch: ["node_modules"],
			max_memory_restart: "300M",
			min_uptime: "2m",
			restart_delay: 5000,
			exp_backoff_restart_delay: 10000,
			env: {
				NODE_ENV: "production",
			},
			env_development: {
				NODE_ENV: "development",
			},
		},
	],
};
