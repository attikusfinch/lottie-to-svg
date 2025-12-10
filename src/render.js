const lottie = require("lottie-web");

/**
 * Recursively sanitizes shape items to prevent 'undefined.length' errors
 */
function sanitizeShapes(shapes) {
	if (!Array.isArray(shapes)) return [];
	
	return shapes.map(shape => {
		if (!shape) return shape;
		
		// Group shapes must have 'it' array
		if (shape.ty === 'gr' && !shape.it) {
			shape.it = [];
		}

        // Remove dashes from strokes to prevent potential hangs
        if (shape.ty === 'st' && shape.d) {
            delete shape.d;
        }
		
		// Recursively sanitize nested shapes
		if (shape.it) {
			shape.it = sanitizeShapes(shape.it);
		}
		
		return shape;
	});
}

/**
 * Sanitizes animation data to fix common issues that crash lottie-web
 */
function sanitizeAnimationData(data) {
	if (!data) return data;
	
	// Deep clone to avoid mutating original
	const sanitized = JSON.parse(JSON.stringify(data));
	
	function sanitizeLayers(layers) {
		if (!Array.isArray(layers)) return;
		
		for (const layer of layers) {
			if (!layer) continue;
			
			// Shape layers (ty: 4) must have shapes array
			if (layer.ty === 4 && !layer.shapes) {
				layer.shapes = [];
			}
			
			if (layer.shapes) {
				layer.shapes = sanitizeShapes(layer.shapes);
			}
			
			// Precomp layers (ty: 0) may have nested layers
			// We don't need to recurse here because we iterate over all assets 
            // in the main sanitizeAnimationData function loop below.
            // Removing recursion avoids cycles and repeated work.
		}
	}
	
	// Sanitize main layers
	if (sanitized.layers) {
		sanitizeLayers(sanitized.layers);
	}
	
	// Sanitize asset layers
	if (sanitized.assets) {
		for (const asset of sanitized.assets) {
			if (asset && asset.layers) {
				sanitizeLayers(asset.layers);
			}
		}
	}
	
	return sanitized;
}

module.exports = (document, animationData, opts, frameNumber) =>
	new Promise((resolve, reject) => {
		try {
			const container = document.createElement("div");
			document.body.append(container);

            console.log("Starting sanitization...");
			const safeAnimationData = sanitizeAnimationData(animationData);
            console.log("Sanitization complete.");

            console.log("Loading animation...");
			var instance = lottie.loadAnimation({
				container: container,
				renderer: "svg",
				loop: false,
				autoplay: false,
				animationData: safeAnimationData,
				rendererSettings: opts
			});
            console.log("Animation loaded instance created.");

			instance.addEventListener("config_ready", () => {
				console.log("Lottie: config_ready");
			});
			instance.addEventListener("data_ready", () => {
				console.log("Lottie: data_ready");
			});
			instance.addEventListener("data_failed", () => {
				console.log("Lottie: data_failed");
				reject(new Error("Lottie data failed to load"));
			});
			instance.addEventListener("error", (error) => {
				console.log("Lottie: error", error);
				reject(error);
			});
			instance.addEventListener("DOMLoaded", () => {
				console.log("Lottie: DOMLoaded");
				try {
					instance.goToAndStop(frameNumber, true);
					resolve(container.innerHTML);
				} catch (e) {
					console.error("Error during goToAndStop", e);
					reject(e);
				}
			});
		} catch (err) {
			reject(err);
		}
	});
