const lottie = require("lottie-web");

/**
 * Recursively sanitizes shape items to prevent 'undefined.length' errors
 */
function sanitizeShapes(shapes) {
	if (!Array.isArray(shapes)) return [];

	for (const shape of shapes) {
		if (!shape) continue;

		// Group shapes must have 'it' array
		if (shape.ty === "gr" && !shape.it) {
			shape.it = [];
		}

		// Remove dashes from strokes to prevent potential hangs
		if (shape.ty === "st" && shape.d) {
			delete shape.d;
		}

		// Recursively sanitize nested shapes
		if (shape.it) {
			shape.it = sanitizeShapes(shape.it);
		}
	}

	return shapes;
}

function cloneAnimationData(data) {
	if (typeof global.structuredClone === "function") {
		try {
			return global.structuredClone(data);
		} catch {
			// Fall back to the previous JSON clone behavior for non-cloneable input.
		}
	}

	return JSON.parse(JSON.stringify(data));
}

/**
 * Sanitizes animation data to fix common issues that crash lottie-web
 */
function sanitizeAnimationData(data) {
	if (!data) return data;

	// Deep clone to avoid mutating original
	const sanitized = cloneAnimationData(data);

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
		let instance;
		let settled = false;
		const container = document.createElement("div");

		function cleanup() {
			if (instance) {
				instance.destroy();
			}

			if (container.parentNode) {
				container.parentNode.removeChild(container);
			}
		}

		function finish(err, svg) {
			if (settled) return;

			settled = true;

			try {
				cleanup();
			} catch (cleanupErr) {
				if (!err) {
					err = cleanupErr;
				}
			}

			if (err) {
				reject(err);
			} else {
				resolve(svg);
			}
		}

		try {
			document.body.append(container);

			const safeAnimationData = sanitizeAnimationData(animationData);

			instance = lottie.loadAnimation({
				container: container,
				renderer: "svg",
				loop: false,
				autoplay: false,
				animationData: safeAnimationData,
				rendererSettings: opts
			});

			instance.addEventListener("data_failed", () => {
				finish(new Error("Lottie data failed to load"));
			});
			instance.addEventListener("error", error => {
				finish(error);
			});
			instance.addEventListener("DOMLoaded", () => {
				try {
					instance.goToAndStop(frameNumber, true);
					finish(null, container.innerHTML);
				} catch (e) {
					finish(e);
				}
			});
		} catch (err) {
			finish(err);
		}
	});
