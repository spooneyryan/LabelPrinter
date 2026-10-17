import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: {
        // Honour PORT when the harness assigns one, so two sessions can run the app at once.
        port: Number(process.env.PORT) || 5180
    },
    build: {
        outDir: "dist",
        sourcemap: false,
        rolldownOptions: {
            output: {
                // The component suite and React change far less often than the app, so they get
                // chunks of their own and stay cached across app releases.
                codeSplitting: {
                    groups: [
                        { name: "eb", test: /node_modules[\\/]@electricblazor[\\/]/ },
                        { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }
                    ]
                }
            }
        }
    }
});
