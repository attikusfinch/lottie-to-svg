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
			if (layer.ty === 0 && layer.refId && sanitized.assets) {
				const asset = sanitized.assets.find(a => a.id === layer.refId);
				if (asset && asset.layers) {
					sanitizeLayers(asset.layers);
				}
			}
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

			const safeAnimationData = sanitizeAnimationData(animationData);

			var instance = lottie.loadAnimation({
				container: container,
				renderer: "svg",
				loop: false,
				autoplay: false,
				animationData: safeAnimationData,
				rendererSettings: opts
			});

			instance.addEventListener("DOMLoaded", () => {
				instance.goToAndStop(frameNumber, true);
				resolve(container.innerHTML);
			});
		} catch (err) {
			reject(err);
		}
	});
