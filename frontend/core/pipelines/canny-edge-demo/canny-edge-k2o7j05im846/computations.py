import os
import cv2
from PIL import Image

def compute(image_path, range_min, range_max, step):
    """
    Computes the Canny edge detection on an image at various thresholds and saves the results.

    Inputs:
        image_path (str): The file path of the image on which edge detection will be applied.
        range_min (int): The minimum threshold value for edge detection.
        range_max (int): The maximum threshold value for edge detection.
        step (int): The step size to increase the threshold value in each iteration.

    Outputs:
        ret (dict of str): dictionnary of file paths where the processed images are saved.

    Requirements:
    """
    print("Computing starting")

    img = Image.open(image_path)
    image_name = os.path.splitext(os.path.basename(image_path))[0]
    print("image_name", image_name)

    image = cv2.imread(image_path)

    path_array = []
    for n in range(range_min, range_max, step):
        # Convert the image to grayscale
        gray_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Apply edge detection using the Canny algorithm
        edges = cv2.Canny(gray_image, 100, n)

        # Save the resulting image with edges
        output_path = "edges_image" + image_name + str(n) + ".jpg"
        cv2.imwrite(output_path, edges)

        path_array.append(output_path)

    ret = {"image_paths": path_array}
    return ret


def test():
    """Test the compute function."""

    print("Running test")
